/**
 * Voice Test Page - Página para testar o sistema de voz J.A.R.V.I.S.
 * Acesse em: /voice-test
 */

import React from 'react';
import { VoiceTestPanel } from '@/components/VoiceTestPanel';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';

export function VoiceTestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirecionar se não autenticado
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Acesso Restrito</h1>
          <p className="text-slate-400 mb-6">Você precisa estar autenticado para acessar esta página.</p>
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-semibold transition-all"
          >
            Ir para Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/chat')}
            className="text-purple-400 hover:text-purple-300 text-sm font-medium mb-4 transition-colors"
          >
            ← Voltar ao Chat
          </button>
          <h1 className="text-4xl font-bold text-white mb-2">Teste de Voz J.A.R.V.I.S.</h1>
          <p className="text-slate-400">
            Sistema de reconhecimento de voz em tempo real com resposta de áudio natural
          </p>
        </div>

        {/* Voice Test Panel */}
        <VoiceTestPanel />

        {/* Informações técnicas */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-800/50 rounded border border-slate-700">
            <h3 className="font-semibold text-white mb-2">🎤 STT (Speech-to-Text)</h3>
            <p className="text-sm text-slate-400">
              Groq Whisper - Transcrição ultra-rápida (&lt;1s)
            </p>
          </div>

          <div className="p-4 bg-slate-800/50 rounded border border-slate-700">
            <h3 className="font-semibold text-white mb-2">🧠 LLM (Large Language Model)</h3>
            <p className="text-sm text-slate-400">
              Groq Llama 3.3 70B - Respostas inteligentes
            </p>
          </div>

          <div className="p-4 bg-slate-800/50 rounded border border-slate-700">
            <h3 className="font-semibold text-white mb-2">🔊 TTS (Text-to-Speech)</h3>
            <p className="text-sm text-slate-400">
              Microsoft Edge TTS - Voz natural e gratuita
            </p>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="mt-8 p-4 bg-slate-800/30 rounded border border-slate-700">
          <h3 className="font-semibold text-white mb-3">❓ Solução de Problemas</h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>
              <span className="text-slate-300">• Sem áudio?</span> Verifique as permissões do navegador
              para acessar o microfone
            </li>
            <li>
              <span className="text-slate-300">• Não reconhece "dev"?</span> Fale mais claramente e
              espere a transcrição aparecer
            </li>
            <li>
              <span className="text-slate-300">• Resposta lenta?</span> Verifique sua conexão com a
              internet
            </li>
            <li>
              <span className="text-slate-300">• Erro de API?</span> Verifique se as chaves do Groq
              estão configuradas
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default VoiceTestPage;
