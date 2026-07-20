#!/bin/bash
# =============================================================
# DevAI Assistant - Script de Update
# Usa quando a IA fizer push de melhorias
# =============================================================

set -e

echo "🔄 Atualizando DevAI Assistant..."

cd /home/ubuntu/dev-ai-assistant

# Pull das últimas mudanças
echo "📥 Puxando mudanças..."
git pull origin main

# Instalar novas dependências (se houver)
echo "📦 Instalando dependências..."
pnpm install

# Build
echo "🏗️  Fazendo build..."
pnpm build

# Reiniciar o servidor
echo "🔄 Reiniciando servidor..."
pm2 restart devai-assistant

echo "✅ Update concluído!"
pm2 status
