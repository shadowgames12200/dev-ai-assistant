import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook para gerenciar a voz do J.A.R.V.I.S. (STT e TTS)
 * Otimizado para latência zero, fala natural e modo "Sempre Ouvindo" (Wake Word).
 */
export function useJarvisVoice(onTranscription: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const queueRef = useRef<string[]>([]);
  const isProcessingQueue = useRef(false);
  const isIntentionalStop = useRef(false); // Para saber se paramos de propósito ou se o navegador derrubou

  // Palavra de ativação (Wake Word)
  const WAKE_WORD = "dev";

  // Inicializar Reconhecimento de Fala
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Modo contínuo ativado
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => {
        setIsListening(true);
        isIntentionalStop.current = false;
      };
      
      recognition.onend = () => {
        setIsListening(false);
        // Reiniciar automaticamente se o modo contínuo estiver ativado E não paramos de propósito (estratégia Stark)
        if (recognitionRef.current && !isIntentionalStop.current) {
          try {
            console.log("Microfone desligado pelo navegador. Reiniciando para manter Jarvis sempre ouvindo...");
            recognitionRef.current.start();
          } catch (err) {
            console.warn('Erro ao reiniciar reconhecimento:', err);
          }
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Erro no reconhecimento:', event.error);
        setError(event.error);
        
        // Se o erro for 'no-speech' (ninguém falou nada), ignoramos e deixamos o onend reiniciar
        if (event.error !== 'no-speech') {
           setIsListening(false);
        }
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
          const textLower = currentText.toLowerCase();
          
          // Lógica de Wake Word (Palavra de Ativação)
          // Se a palavra Jarvis estiver na frase, mandamos para a IA processar
          if (textLower.includes(WAKE_WORD)) {
             console.log("Dev ativado! Comando recebido:", currentText);
             onTranscription(currentText);
          } else {
             console.log("Ignorado (sem wake word):", currentText);
          }
          
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
    
    // Limpeza ao desmontar
    return () => {
        isIntentionalStop.current = true;
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
    };
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
    utterance.rate = 1.1; // Um pouco mais rápido para parecer mais natural/robótico
    utterance.pitch = 0.9; // Um pouco mais grave para parecer o Jarvis

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
        isIntentionalStop.current = false;
        recognitionRef.current.start();
      } catch (e) {
        console.error('Falha ao iniciar reconhecimento:', e);
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      isIntentionalStop.current = true; // Avisa que paramos de propósito
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
