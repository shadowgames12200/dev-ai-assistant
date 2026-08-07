# Guia Completo: Ollama + Plugins + Voz Otimizada

## 🚀 Começando com Ollama

### O que é Ollama?

Ollama permite rodar modelos de IA **100% localmente** no seu computador, sem depender de APIs externas. Ideal para:
- Privacidade total
- Sem custos de API
- Funciona offline
- Modelos open-source de alta qualidade

### Instalação do Ollama

#### Windows/Mac
1. Acesse [ollama.ai](https://ollama.ai)
2. Baixe o instalador para seu sistema
3. Execute e siga as instruções

#### Linux
```bash
curl https://ollama.ai/install.sh | sh
```

### Baixar um Modelo

Após instalar, abra o terminal e execute:

```bash
# Modelo rápido e leve (recomendado para iniciar)
ollama pull mistral

# Modelo mais poderoso (requer mais RAM)
ollama pull llama2

# Modelo otimizado para chat
ollama pull neural-chat

# Modelo pequeno e rápido
ollama pull orca-mini
```

### Verificar Modelos Disponíveis

```bash
ollama list
```

### Testar Ollama Localmente

```bash
ollama run mistral
# Digite sua pergunta e pressione Enter
```

---

## 🔌 Sistema de Plugins

### Estrutura de Diretórios

```
seu-projeto/
├── plugins/
│   ├── example-plugin.js
│   ├── seu-plugin-python.py
│   ├── seu-script-shell.sh
│   └── README.md
├── server/
└── client/
```

### Criar um Plugin JavaScript

Crie o arquivo `plugins/weather.js`:

```javascript
/**
{
  "name": "weather",
  "description": "Obtém informações do tempo para uma cidade",
  "parameters": {
    "type": "object",
    "properties": {
      "city": {
        "type": "string",
        "description": "Nome da cidade (ex: São Paulo, Rio de Janeiro)"
      },
      "units": {
        "type": "string",
        "enum": ["metric", "imperial"],
        "description": "Unidades de temperatura"
      }
    },
    "required": ["city"]
  }
}
*/

export default async function weatherPlugin(args) {
  const { city, units = "metric" } = args;
  
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m,weather_code`
    );
    const data = await response.json();
    
    return `Tempo em ${city}: ${data.current.temperature_2m}°${units === "metric" ? "C" : "F"}`;
  } catch (error) {
    return `Erro ao obter tempo: ${error.message}`;
  }
}
```

### Criar um Plugin Python

Crie o arquivo `plugins/data_analysis.py`:

```python
#!/usr/bin/env python3
"""
{
  "name": "data_analysis",
  "description": "Analisa dados e gera estatísticas",
  "parameters": {
    "type": "object",
    "properties": {
      "data": {
        "type": "array",
        "description": "Array de números para análise"
      },
      "operation": {
        "type": "string",
        "enum": ["mean", "median", "std", "sum"],
        "description": "Operação estatística"
      }
    },
    "required": ["data", "operation"]
  }
}
"""

import json
import sys
import statistics

def analyze(args):
    data = args.get("data", [])
    operation = args.get("operation", "mean")
    
    if not data:
        return "Erro: dados vazios"
    
    try:
        if operation == "mean":
            result = statistics.mean(data)
        elif operation == "median":
            result = statistics.median(data)
        elif operation == "std":
            result = statistics.stdev(data) if len(data) > 1 else 0
        elif operation == "sum":
            result = sum(data)
        else:
            return "Operação desconhecida"
        
        return f"Resultado de {operation}: {result}"
    except Exception as e:
        return f"Erro: {str(e)}"

if __name__ == "__main__":
    args = json.loads(sys.argv[1])
    print(analyze(args))
```

### Criar um Plugin Shell

Crie o arquivo `plugins/system_info.sh`:

```bash
#!/bin/bash

# Metadados do plugin
# {
#   "name": "system_info",
#   "description": "Obtém informações do sistema",
#   "parameters": {
#     "type": "object",
#     "properties": {
#       "info_type": {
#         "type": "string",
#         "enum": ["cpu", "memory", "disk", "all"],
#         "description": "Tipo de informação"
#       }
#     },
#     "required": ["info_type"]
#   }
# }

INFO_TYPE="${1:-all}"

case "$INFO_TYPE" in
  cpu)
    echo "CPU: $(nproc) cores"
    ;;
  memory)
    echo "Memória: $(free -h | grep Mem | awk '{print $2}')"
    ;;
  disk)
    echo "Disco: $(df -h / | tail -1 | awk '{print $2, "usado:", $3}')"
    ;;
  all)
    echo "=== Informações do Sistema ==="
    echo "CPU: $(nproc) cores"
    echo "Memória: $(free -h | grep Mem | awk '{print $2}')"
    echo "Disco: $(df -h / | tail -1 | awk '{print $2, "usado:", $3}')"
    echo "Uptime: $(uptime -p)"
    ;;
  *)
    echo "Tipo desconhecido: $INFO_TYPE"
    ;;
esac
```

---

## 🎙️ Sistema de Voz Otimizado

### Configurar Variáveis de Ambiente

Adicione ao seu `.env`:

```env
# OpenAI TTS (recomendado para qualidade)
OPENAI_API_KEY=sk-seu-token-aqui

# Google Cloud TTS (alternativa)
GOOGLE_CLOUD_API_KEY=sua-chave-aqui

# Azure Speech (alternativa)
AZURE_SPEECH_KEY=sua-chave-aqui
AZURE_REGION=eastus

# Diretório de cache de voz
VOICE_CACHE_DIR=./voice-cache
```

### Usar Voz no Frontend

```typescript
import { voiceOptimizer } from "@/lib/voice-optimizer";

// Sintetizar fala com cache automático
const audioBuffer = await voiceOptimizer.synthesizeWithFallback(
  "Olá, como você está?",
  {
    language: "pt-BR",
    speed: 1.0,
    voice: "nova" // Para OpenAI
  }
);

// Reproduzir áudio
const audio = new Audio(URL.createObjectURL(new Blob([audioBuffer])));
audio.play();
```

### Limpar Cache de Voz

```bash
# Via API
curl -X POST http://localhost:3000/api/voice/cache/clear

# Via CLI
npm run voice:cache:clear
```

---

## 🔧 Configuração Avançada

### Usar Ollama com DevAI

1. **Inicie o Ollama**:
```bash
ollama serve
```

2. **Configure a variável de ambiente**:
```env
OLLAMA_URL=http://localhost:11434
LOCAL_MODE=true
```

3. **O DevAI usará Ollama automaticamente** quando:
   - Estiver em modo local
   - Ollama estiver disponível
   - Como fallback se Groq falhar

### Monitorar Plugins em Tempo Real

O sistema monitora automaticamente mudanças no diretório `plugins/`. Basta adicionar um novo arquivo e ele será carregado!

### Estatísticas de Cache

```bash
# Obter tamanho do cache de voz
curl http://localhost:3000/api/voice/cache/stats
```

---

## 📊 Comparação de Modelos Ollama

| Modelo | Tamanho | Velocidade | Qualidade | RAM Mínima |
|--------|---------|-----------|-----------|-----------|
| orca-mini | 1.3GB | ⚡⚡⚡ | ⭐⭐ | 4GB |
| mistral | 4GB | ⚡⚡ | ⭐⭐⭐ | 8GB |
| neural-chat | 4GB | ⚡⚡ | ⭐⭐⭐ | 8GB |
| llama2 | 7GB | ⚡ | ⭐⭐⭐⭐ | 16GB |
| llama2-13b | 13GB | ⚡ | ⭐⭐⭐⭐⭐ | 24GB |

---

## 🐛 Troubleshooting

### Ollama não conecta

```bash
# Verificar se Ollama está rodando
curl http://localhost:11434/api/tags

# Se não funcionar, reinicie Ollama
ollama serve
```

### Plugin não carrega

1. Verifique a sintaxe do JSON nos metadados
2. Verifique se o arquivo está no diretório `plugins/`
3. Verifique os logs do servidor

### Voz muito lenta

1. Limpe o cache: `npm run voice:cache:clear`
2. Reduza a qualidade: use `tts-1` em vez de `tts-1-hd`
3. Use cache: `cacheEnabled: true`

---

## 💡 Exemplos de Uso

### Exemplo 1: Análise de Dados com Plugin Python

```
Usuário: "Analise esses números: 10, 20, 30, 40, 50"
J.A.R.V.I.S.: "Vou usar meu plugin de análise de dados..."
[Executa: data_analysis.py com os números]
J.A.R.V.I.S.: "Média: 30, Mediana: 30, Desvio Padrão: 15.81"
```

### Exemplo 2: Modo Híbrido com Ollama

```
Usuário: "Responda uma pergunta complexa"
J.A.R.V.I.S.: 
- Tenta Groq (nuvem)
- Se falhar, tenta Ollama (local)
- Se ambos falharem, usa Gemini como fallback
```

### Exemplo 3: Voz com Cache

```
Primeira vez: "Olá" → Síntese com OpenAI (2s)
Segunda vez: "Olá" → Reproduz do cache (0.1s)
```

---

## 🚀 Próximos Passos

1. Instale Ollama e baixe um modelo
2. Crie seu primeiro plugin em JavaScript
3. Configure as variáveis de voz
4. Teste o modo híbrido!

---

*Guia criado em 07/08/2026 - Manus AI*
