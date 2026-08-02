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
      recognition.continuous = true; // Modo contínuo ativado
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        // Reiniciar automaticamente se o modo contínuo estiver ativado (estratégia Stark)
        if (recognitionRef.current && window.localStorage.getItem('jarvis_mic_continuous') === 'true') {
          try {
            recognitionRef.current.start();
          } catch (err) {
            console.warn('Erro ao reiniciar reconhecimento:', err);
          }
        }
      };
      recognition.onerror = (event: any) => {
        console.error('Erro no reconhecimento:', event.error);
        setError(event.error);
        setIsListening(false);
      };

      let finalTranscript = '';
      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        const currentText = finalTranscript || interimTranscript;
        
        if (event.results[0].isFinal && currentText.trim().length > 0) {
          onTranscription(currentText);
          finalTranscript = ''; 
        }
      };

      recognitionRef.current = recognition;
    }

    synthRef.current = window.speechSynthesis;
    
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        console.log("Vozes carregadas:", window.speechSynthesis.getVoices().length);
      };
    }
  }, [onTranscription]);

  const processQueue = useCallback(() => {
    if (!synthRef.current || isProcessingQueue.current || queueRef.current.length === 0) {
      return;
    }

    isProcessingQueue.current = true;
    const text = queueRef.current.shift()!;
    
    const cleanText = text.replace(/[*_#\`]/g, '').trim();
    if (!cleanText) {
      isProcessingQueue.current = false;
      processQueue();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05; 
    utterance.pitch = 0.95; 

    const voices = synthRef.current.getVoices();
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

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Falha ao iniciar reconhecimento:', e);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const speak = useCallback((text: string, isPartial = false) => {
    if (!synthRef.current) return;

    if (!isPartial) {
      synthRef.current.cancel();
      queueRef.current = [text];
    } else {
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
