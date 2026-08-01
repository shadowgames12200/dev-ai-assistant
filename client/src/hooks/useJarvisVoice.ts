import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook para gerenciar a voz do J.A.R.V.I.S. (STT e TTS)
 * Otimizado para latência zero e fala natural.
 */
export function useJarvisVoice(onTranscription: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const queueRef = useRef<string[]>([]);
  const isProcessingQueue = useRef(false);

  // Inicializar Reconhecimento de Fala
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = (event: any) => {
        console.error('Erro no reconhecimento:', event.error);
        setError(event.error);
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');

        if (event.results[0].isFinal) {
          onTranscription(transcript);
        }
      };

      recognitionRef.current = recognition;
    }

    synthRef.current = window.speechSynthesis;
    
    // Forçar carregamento de vozes
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        console.log("Vozes carregadas:", window.speechSynthesis.getVoices().length);
      };
    }
  }, [onTranscription]);

  // Processador de fila de fala (para falar enquanto a resposta chega)
  const processQueue = useCallback(() => {
    if (!synthRef.current || isProcessingQueue.current || queueRef.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;
    const text = queueRef.current.shift()!;
    
    // Limpar texto de markdown e caracteres especiais para fala mais limpa
    const cleanText = text.replace(/[*_#`]/g, '').trim();
    if (!cleanText) {
      isProcessingQueue.current = false;
      processQueue();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05; // Velocidade natural
    utterance.pitch = 0.95; // Tom sofisticado

    const voices = synthRef.current.getVoices();
    // Priorizar vozes premium e naturais
    const preferredVoice = voices.find(v => 
      (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Microsoft')) && 
      v.lang.startsWith('pt')
    ) || voices.find(v => v.lang.startsWith('pt'));

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      isProcessingQueue.current = false;
      processQueue();
    };
    utterance.onerror = () => {
      isProcessingQueue.current = false;
      processQueue();
    };

    synthRef.current.speak(utterance);
  }, []);

  // Iniciar Escuta
  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Falha ao iniciar reconhecimento:', e);
      }
    }
  }, [isListening]);

  // Parar Escuta
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  // Falar Texto (TTS) com suporte a fila
  const speak = useCallback((text: string, isPartial = false) => {
    if (!synthRef.current) return;

    if (!isPartial) {
      synthRef.current.cancel();
      queueRef.current = [text];
    } else {
      // Se for parcial, quebra por sentenças para falar mais rápido
      const sentences = text.split(/[.!?\n]/).filter(s => s.trim().length > 10);
      queueRef.current.push(...sentences);
    }
    
    processQueue();
  }, [processQueue]);

  return {
    isListening,
    isSpeaking,
    error,
    startListening,
    stopListening,
    speak
  };
}
