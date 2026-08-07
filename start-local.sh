#!/bin/bash

echo "🚀 Iniciando DevAI Assistant em modo LOCAL..."

# Verificar se as dependências estão instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Definir variáveis de ambiente para modo local se não existirem
export NODE_ENV=development
export PORT=3000

# Se não houver DATABASE_URL, o sistema usará o fallback de memória (agora persistente em JSON)
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️ DATABASE_URL não encontrada. Usando armazenamento local (local_db.json)."
fi

# Iniciar o servidor e o cliente em paralelo
echo "🌐 Servidor rodando em http://localhost:3000"
npm run dev
