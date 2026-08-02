# Sistema de Voz J.A.R.V.I.S. - Documentação Completa

## 🎯 Visão Geral

O sistema de voz J.A.R.V.I.S. permite que você converse com a IA usando apenas sua voz, em tempo real, com respostas em áudio natural. É como conversar com o J.A.R.V.I.S. do Tony Stark!

### Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Vercel)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  useRealtimeVoice Hook                               │  │
│  │  - Captura áudio via MediaRecorder                   │  │
│  │  - Envia chunks a cada 500ms                         │  │
│  │  - Reproduz áudio de resposta                        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────────┘
                   │ tRPC
┌──────────────────▼──────────────────────────────────────────┐
│                   Backend (Northflank)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Voice Routes (voice-routes.ts)                      │  │
│  │  - transcribe: Groq Whisper STT                      │  │
│  │  - synthesize: Edge TTS                              │  │
│  │  - processVoiceCommand: Pipeline completo            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Realtime Voice System (realtime-voice.ts)           │  │
│  │  - GroqWhisper: STT ultra-rápido                     │  │
│  │  - EdgeTTS: Síntese de voz natural                   │  │
│  │  - Wake Word Detection: Detecta "dev"                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  LLM Integration (Groq Llama 3.3 70B)                │  │
│  │  - Processa a transcrição                            │  │
│  │  - Gera resposta inteligente                         │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## 🚀 Como Usar

### 1. Acessar a Página de Teste

Acesse: `https://seu-site.vercel.app/voice-test`

### 2. Iniciar a Escuta

Clique no botão **"Iniciar Escuta"** para começar a capturar áudio.

### 3. Falar o Wake Word

Diga **"dev"** para ativar a IA. Você verá uma confirmação na tela.

### 4. Fazer uma Pergunta

Após ativar com "dev", faça sua pergunta normalmente:
- "Dev, qual é a capital do Brasil?"
- "Dev, me explique sobre Python"
- "Dev, qual é a data de hoje?"

### 5. Ouvir a Resposta

A IA processará sua pergunta e responderá com áudio natural em português.

## 🔧 Configuração

### Variáveis de Ambiente Necessárias

```env
# Obrigatório - Chave da API Groq
GROQ_API_KEY=gsk_...

# Opcional - URL base do Groq (padrão: https://api.groq.com/openai/v1)
GROQ_API_BASE=https://api.groq.com/openai/v1

# Opcional - Ativar TTS (padrão: true)
EDGE_TTS_ENABLED=true

# Opcional - Chave Google Cloud para TTS premium
GOOGLE_CLOUD_API_KEY=
```

### Configurar no Northflank

1. Acesse o painel do Northflank
2. Vá para "Environment Variables"
3. Adicione `GROQ_API_KEY` com sua chave

### Configurar na Vercel

1. Acesse o painel da Vercel
2. Vá para "Environment Variables"
3. Adicione as mesmas variáveis

## 📝 API de Voz

### tRPC Procedures

#### `voice.transcribe`
Transcrever áudio para texto usando Groq Whisper.

```typescript
const result = await trpc.voice.transcribe.mutate({
  audioBase64: audioBuffer.toString('base64'),
  language: 'pt-BR', // opcional
  mimeType: 'audio/webm' // opcional
});

// Retorna:
// {
//   text: "Qual é a capital do Brasil?",
//   confidence: 0.95,
//   language: "pt-BR",
//   duration: 3,
//   wakeWordDetected: true
// }
```

#### `voice.synthesize`
Converter texto em áudio usando Edge TTS.

```typescript
const audio = await trpc.voice.synthesize.mutate({
  text: "A capital do Brasil é Brasília",
  language: 'pt-BR' // opcional
});

// Retorna:
// {
//   audioUrl: "data:audio/mpeg;base64,...",
//   duration: 5
// }
```

#### `voice.processVoiceCommand`
Pipeline completo: áudio → texto → resposta IA → áudio.

```typescript
const response = await trpc.voice.processVoiceCommand.mutate({
  audioBase64: audioBuffer.toString('base64'),
  language: 'pt-BR',
  llmResponse: 'Resposta da IA para sintetizar'
});
```

#### `voice.detectWakeWord`
Verificar se um texto contém a palavra de ativação.

```typescript
const result = await trpc.voice.detectWakeWord.query({
  text: "Dev, qual é a hora?"
});

// Retorna:
// { detected: true, wakeWord: "dev" }
```

#### `voice.healthCheck`
Verificar se o sistema de voz está funcionando.

```typescript
const health = await trpc.voice.healthCheck.query();

// Retorna:
// {
//   status: "ok",
//   voiceSystemReady: true,
//   features: {
//     groqWhisper: true,
//     edgeTts: true,
//     wakeWordDetection: true,
//     realTimeStreaming: true
//   }
// }
```

## 🎤 Hook React: `useRealtimeVoice`

### Uso Básico

```typescript
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice';

function MyComponent() {
  const voice = useRealtimeVoice(
    (transcript) => console.log('Transcrição:', transcript),
    (audioUrl) => console.log('Áudio:', audioUrl),
    {
      language: 'pt-BR',
      wakeWord: 'dev',
      autoStart: false,
      chunkDuration: 500
    }
  );

  return (
    <div>
      <button onClick={voice.startListening}>
        {voice.isListening ? 'Ouvindo...' : 'Iniciar'}
      </button>
      <button onClick={voice.stopListening}>Parar</button>
      
      {voice.transcript && <p>Você disse: {voice.transcript}</p>}
      {voice.error && <p>Erro: {voice.error}</p>}
    </div>
  );
}
```

### Propriedades Retornadas

```typescript
{
  // Estados
  isListening: boolean;      // Está capturando áudio?
  isProcessing: boolean;     // Está processando?
  isSpeaking: boolean;       // Está reproduzindo áudio?
  error: string | null;      // Mensagem de erro
  transcript: string;        // Transcrição final
  interimTranscript: string; // Transcrição temporária

  // Métodos
  startListening(): void;    // Iniciar captura
  stopListening(): void;     // Parar captura
  playAudioResponse(url: string): void; // Reproduzir áudio
}
```

## 🌐 Idiomas Suportados

O sistema suporta múltiplos idiomas. Alguns exemplos:

| Idioma | Código | Voz |
|--------|--------|-----|
| Português (Brasil) | `pt-BR` | pt-BR-AntonioNeural |
| Português (Portugal) | `pt-PT` | pt-PT-DuarteNeural |
| Inglês (EUA) | `en-US` | en-US-GuyNeural |
| Espanhol | `es-ES` | es-ES-AlvaroNeural |
| Francês | `fr-FR` | fr-FR-HenriNeural |

## 🔊 Qualidade de Áudio

### STT (Speech-to-Text)
- **Modelo**: Groq Whisper Large V3 Turbo
- **Latência**: < 1 segundo
- **Precisão**: 95%+
- **Idiomas**: 99+

### TTS (Text-to-Speech)
- **Modelo**: Microsoft Edge TTS (gratuito)
- **Qualidade**: Natural e humana
- **Velocidade**: Configurável
- **Idiomas**: 100+

## 🐛 Solução de Problemas

### Problema: "Permissão de microfone negada"
**Solução**: 
1. Verifique as configurações de permissões do navegador
2. Recarregue a página
3. Tente em outro navegador

### Problema: "Não reconhece 'dev'"
**Solução**:
1. Fale mais claramente
2. Aumente o volume do microfone
3. Verifique se o navegador está capturando áudio

### Problema: "Erro de transcrição"
**Solução**:
1. Verifique se `GROQ_API_KEY` está configurada
2. Verifique a conexão com a internet
3. Verifique se o arquivo de áudio não está corrompido

### Problema: "Sem áudio na resposta"
**Solução**:
1. Verifique se `EDGE_TTS_ENABLED=true`
2. Verifique o volume do navegador
3. Tente recarregar a página

## 📊 Métricas e Monitoramento

### Logs do Backend

```typescript
// Transcrição bem-sucedida
[GroqWhisper] Transcrição: "Qual é a capital do Brasil?"

// Síntese de voz bem-sucedida
[EdgeTTS] Áudio gerado com sucesso

// Wake word detectado
[RealtimeVoice] Transcrição: "Dev, qual é a hora?"
```

### Monitoramento em Produção

Monitore estas métricas:
- Latência de transcrição (STT)
- Latência de síntese (TTS)
- Taxa de erro de reconhecimento
- Uso de API do Groq

## 🚀 Próximas Melhorias

- [ ] Streaming WebSocket para latência zero
- [ ] Suporte a múltiplos wake words
- [ ] Cache de respostas de áudio
- [ ] Análise de sentimento de voz
- [ ] Customização de vozes
- [ ] Integração com assistentes de voz do SO

## 📚 Referências

- [Groq Whisper API](https://console.groq.com/docs/speech-text)
- [Microsoft Edge TTS](https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/text-to-speech)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)

## 📞 Suporte

Se encontrar problemas, verifique:
1. Logs do navegador (F12 → Console)
2. Logs do servidor (Northflank Dashboard)
3. Variáveis de ambiente configuradas corretamente
4. Conexão com a internet estável

---

**Criado por**: Manus AI Assistant  
**Data**: 2 de Agosto de 2026  
**Versão**: 1.0.0
