/**
 * Voice Test Panel - J.A.R.V.I.S. Voice Testing Component
 * 
 * Componente para testar o sistema de voz em tempo real
 * Fale "dev" para ativar, depois faça uma pergunta!
 */

import React, { useState, useCallback } from 'react';
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice';
import { trpc } from '@/lib/trpc';
import { Mic, MicOff, Volume2, AlertCircle } from 'lucide-react';

export function VoiceTestPanel() {
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);

  // Hooks de voz
  const voice = useRealtimeVoice(
    (transcript) => handleTranscription(transcript),
    (audioUrl) => handleAudioResponse(audioUrl),
    {
      language: 'pt-BR',
      wakeWord: 'dev',
      autoStart: false,
      chunkDuration: 500,
    }
  );

  // Processar transcrição
  const handleTranscription = useCallback(async (transcript: string) => {
    console.log('[VoiceTest] Transcrição recebida:', transcript);
    
    // Adicionar mensagem do usuário
    setMessages((prev) => [...prev, { role: 'user', text: transcript }]);
    setIsWaitingForResponse(true);

    try {
      // Chamar a IA para processar o comando
      const response = await trpc.chat.send.mutate({
        conversationId: 1, // Usar conversa padrão de teste
        content: transcript,
      });

      // Extrair resposta
      const lastMessage = response.messages[response.messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        setMessages((prev) => [...prev, { role: 'assistant', text: lastMessage.content }]);

        // Sintetizar voz da resposta
        try {
          const audioResponse = await trpc.voice.synthesize.mutate({
            text: lastMessage.content.slice(0, 500), // Limitar a 500 caracteres
            language: 'pt-BR',
          });

          // Reproduzir áudio
          voice.playAudioResponse(audioResponse.audioUrl);
        } catch (err) {
          console.error('[VoiceTest] Erro ao sintetizar voz:', err);
        }
      }
    } catch (err) {
      console.error('[VoiceTest] Erro ao processar comando:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Desculpe, ocorreu um erro ao processar seu comando.' },
      ]);
    } finally {
      setIsWaitingForResponse(false);
    }
  }, [voice]);

  // Processar resposta de áudio
  const handleAudioResponse = useCallback((audioUrl: string) => {
    console.log('[VoiceTest] Reproduzindo áudio:', audioUrl);
  }, []);

  // Iniciar/parar escuta
  const toggleListening = useCallback(() => {
    if (voice.isListening) {
      voice.stopListening();
      setIsActive(false);
    } else {
      voice.startListening();
      setIsActive(true);
    }
  }, [voice]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg border border-purple-500/30 shadow-2xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Volume2 className="w-6 h-6 text-purple-400" />
          J.A.R.V.I.S. Voice Test
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          Diga <span className="font-mono text-purple-300">"dev"</span> para ativar, depois faça uma pergunta!
        </p>
      </div>

      {/* Status */}
      <div className="mb-4 p-3 bg-slate-800/50 rounded border border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {voice.isListening ? (
              <>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-400">Ouvindo...</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                <span className="text-sm text-slate-400">Inativo</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {voice.isSpeaking && <span className="text-blue-400">🔊 Reproduzindo áudio</span>}
            {isWaitingForResponse && <span className="text-yellow-400">⏳ Processando...</span>}
          </div>
        </div>

        {/* Transcrição em tempo real */}
        {(voice.transcript || voice.interimTranscript) && (
          <div className="mt-2 p-2 bg-slate-900/50 rounded text-sm">
            {voice.transcript && (
              <p className="text-white">
                <span className="text-slate-500">Você: </span>
                {voice.transcript}
              </p>
            )}
            {voice.interimTranscript && !voice.transcript && (
              <p className="text-slate-400 italic">
                <span className="text-slate-600">Você (interim): </span>
                {voice.interimTranscript}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Erro */}
      {voice.error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">{voice.error}</div>
        </div>
      )}

      {/* Histórico de mensagens */}
      <div className="mb-4 max-h-96 overflow-y-auto space-y-3 bg-slate-900/30 rounded p-4 border border-slate-700/50">
        {messages.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">
            Nenhuma mensagem ainda. Clique no botão abaixo e diga "dev" para começar!
          </p>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3 rounded text-sm ${
                msg.role === 'user'
                  ? 'bg-purple-900/30 border border-purple-500/30 text-purple-100 ml-8'
                  : 'bg-blue-900/30 border border-blue-500/30 text-blue-100 mr-8'
              }`}
            >
              <p className="font-semibold text-xs mb-1 opacity-75">
                {msg.role === 'user' ? '👤 Você' : '🤖 J.A.R.V.I.S.'}
              </p>
              <p className="line-clamp-3">{msg.text}</p>
            </div>
          ))
        )}
      </div>

      {/* Botões de controle */}
      <div className="flex gap-3">
        <button
          onClick={toggleListening}
          disabled={isWaitingForResponse}
          className={`flex-1 py-3 px-4 rounded font-semibold flex items-center justify-center gap-2 transition-all ${
            voice.isListening
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-purple-600 hover:bg-purple-700 text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {voice.isListening ? (
            <>
              <MicOff className="w-5 h-5" />
              Parar Escuta
            </>
          ) : (
            <>
              <Mic className="w-5 h-5" />
              Iniciar Escuta
            </>
          )}
        </button>

        <button
          onClick={() => setMessages([])}
          disabled={isWaitingForResponse || messages.length === 0}
          className="py-3 px-4 rounded font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Limpar
        </button>
      </div>

      {/* Instruções */}
      <div className="mt-4 p-3 bg-slate-800/50 rounded text-xs text-slate-400 space-y-1">
        <p>
          <span className="text-slate-300">💡 Dica:</span> Após clicar em "Iniciar Escuta", fale "dev" para ativar a IA.
        </p>
        <p>
          <span className="text-slate-300">🎤 Exemplo:</span> "Dev, qual é a capital do Brasil?"
        </p>
        <p>
          <span className="text-slate-300">⚙️ Requisitos:</span> Navegador moderno com suporte a Web Audio API.
        </p>
      </div>
    </div>
  );
}

export default VoiceTestPanel;
