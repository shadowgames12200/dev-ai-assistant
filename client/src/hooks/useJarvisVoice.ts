import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook para gerenciar a voz do J.A.R.V.I.S. (STT e TTS)
 * Utiliza a Web Speech API (Gratuita e Nativa)
 */
export function useJarvisVoice(onTranscription: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Inicializar Reconhecimento de Fala
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Parar após uma frase
      recognition.interimResults = true; // Mostrar resultados parciais
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
    } else {
      setError('Seu navegador não suporta reconhecimento de fala.');
    }

    synthRef.current = window.speechSynthesis;
  }, [onTranscription]);

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

  // Falar Texto (TTS)
  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;

    // Cancelar qualquer fala anterior
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.1; // Um pouco mais rápido para parecer inteligente
    utterance.pitch = 0.9; // Um pouco mais grave para parecer o Jarvis

    // Tentar encontrar uma voz masculina/profissional se disponível
    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Daniel')
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthRef.current.speak(utterance);
  }, []);

  return {
    isListening,
    isSpeaking,
    error,
    startListening,
    stopListening,
    speak
  };
}
