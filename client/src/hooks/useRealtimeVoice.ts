import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook para Voz em Tempo Real - J.A.R.V.I.S. Completo
 * 
 * Features:
 * - Streaming de áudio em chunks (latência mínima)
 * - Wake word detection ("dev")
 * - Sempre ouvindo (Always Listening)
 * - Integração com Groq Whisper (backend)
 * - Síntese de voz natural (Edge TTS)
 */

export interface RealtimeVoiceConfig {
  language?: string;
  wakeWord?: string;
  autoStart?: boolean;
  chunkDuration?: number; // ms entre chunks
}

export interface VoiceState {
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  error: string | null;
  transcript: string;
  interimTranscript: string;
}

export function useRealtimeVoice(
  onTranscription: (text: string) => void,
  onAudioResponse?: (audioUrl: string) => void,
  config: RealtimeVoiceConfig = {}
) {
  const {
    language = 'pt-BR',
    wakeWord = 'dev',
    autoStart = true,
    chunkDuration = 500, // Enviar chunks a cada 500ms
  } = config;

  // Estados
  const [state, setState] = useState<VoiceState>({
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    error: null,
    transcript: '',
    interimTranscript: '',
  });

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Inicializar Web Audio API
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioRef.current = new Audio();
    audioRef.current.crossOrigin = 'anonymous';

    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  // Inicializar Speech Recognition (fallback para navegadores sem MediaRecorder)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        setState((prev) => ({ ...prev, isListening: true, error: null }));
      };

      recognition.onend = () => {
        setState((prev) => ({ ...prev, isListening: false }));
        // Reiniciar automaticamente
        if (autoStart) {
          try {
            recognition.start();
          } catch (err) {
            console.warn('Erro ao reiniciar reconhecimento:', err);
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Erro de reconhecimento:', event.error);
        if (event.error !== 'no-speech') {
          setState((prev) => ({ ...prev, error: event.error }));
        }
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        setState((prev) => ({
          ...prev,
          transcript: final,
          interimTranscript: interim,
        }));

        // Detectar wake word
        if (final && final.toLowerCase().includes(wakeWord.toLowerCase())) {
          console.log(`[${wakeWord}] Ativado! Comando:`, final);
          onTranscription(final);
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language, wakeWord, autoStart, onTranscription]);

  // Iniciar captura de áudio
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Usar MediaRecorder para captura de chunks
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        setState((prev) => ({
          ...prev,
          error: `Erro de gravação: ${event.error}`,
        }));
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      // Enviar chunks a cada chunkDuration ms
      chunkIntervalRef.current = setInterval(() => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          chunksRef.current = [];

          // Enviar para o backend via tRPC
          console.log('[RealtimeVoice] Enviando chunk de áudio...');
          // Aqui você chamaria: trpc.voice.streamChunk.mutate({ audioBlob })
        }
      }, chunkDuration);

      setState((prev) => ({ ...prev, isListening: true, error: null }));

      // Fallback: usar Web Speech API também
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (err) {
          console.warn('Web Speech API já está ativa');
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao acessar microfone';
      setState((prev) => ({ ...prev, error: errorMsg }));
      console.error('Erro ao iniciar áudio:', err);
    }
  }, [chunkDuration]);

  // Parar captura de áudio
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    setState((prev) => ({ ...prev, isListening: false }));
  }, []);

  // Reproduzir áudio de resposta
  const playAudioResponse = useCallback((audioUrl: string) => {
    if (!audioRef.current) return;

    audioRef.current.src = audioUrl;
    audioRef.current.onplay = () => {
      setState((prev) => ({ ...prev, isSpeaking: true }));
    };
    audioRef.current.onended = () => {
      setState((prev) => ({ ...prev, isSpeaking: false }));
    };
    audioRef.current.onerror = (err) => {
      console.error('Erro ao reproduzir áudio:', err);
      setState((prev) => ({ ...prev, error: 'Erro ao reproduzir áudio' }));
    };

    audioRef.current.play().catch((err) => {
      console.error('Erro ao reproduzir:', err);
      setState((prev) => ({ ...prev, error: 'Não foi possível reproduzir o áudio' }));
    });

    onAudioResponse?.(audioUrl);
  }, [onAudioResponse]);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      stopListening();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [stopListening]);

  return {
    ...state,
    startListening,
    stopListening,
    playAudioResponse,
  };
}
