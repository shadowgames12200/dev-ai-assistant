#!/bin/bash
# =============================================================
# DevAI Assistant - Setup Script para Ubuntu (Oracle Cloud)
# Instala todas as dependências necessárias
# =============================================================
# chmod +x setup-ubuntu.sh && sudo ./setup-ubuntu.sh

set -e

echo "🚀 Iniciando instalação do DevAI Assistant..."
echo ""

# ─── 1. Atualizar sistema ───
echo "📦 Atualizando sistema..."
sudo apt update && sudo apt upgrade -y

# ─── 2. Instalar Node.js 20 + pnpm ───
echo "🟢 Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar pnpm
echo "📦 Instalando pnpm..."
npm install -g pnpm

# ─── 3. Instalar ferramentas de análise binária ───
echo "🔧 Instalando ferramentas de análise..."
sudo apt install -y \
  file \
  binutils \
  unzip \
  zip \
  p7zip-full \
  exiftool \
  hexdump \
  build-essential \
  python3 \
  python3-pip \
  git

# ─── 4. Instalar dependências do Node para análise binária ───
echo "📦 Instalando dependências Node..."
# Estas serão instaladas no passo de pnpm install

# ─── 5. Clonar o repositório ───
echo "📥 Clonando repositório..."
cd /home/ubuntu
git clone https://github.com/shadowgames12200/dev-ai-assistant.git
cd dev-ai-assistant

# ─── 6. Instalar dependências ───
echo "📦 Instalando dependências do projeto..."
pnpm install

# ─── 7. Configurar variáveis de ambiente ───
echo "🔑 Configurando variáveis de ambiente..."
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# GROQ API KEY (obter em https://console.groq.com/keys)
GROQ_API_KEY=

# Database URL (Neon, Supabase, ou outro PostgreSQL)
DATABASE_URL=

# App URL
APP_URL=http://localhost:3000

# GitHub Token (para auto-melhoria)
GITHUB_TOKEN=
EOF
  echo "⚠️  Arquivo .env criado. Configure suas variáveis!"
else
  echo "✅ Arquivo .env já existe."
fi

# ─── 8. Configurar banco de dados ───
echo "🗄️  Configurando banco de dados..."
pnpm db:push 2>/dev/null || echo "⚠️  Configure DATABASE_URL primeiro"

# ─── 9. Build ───
echo "🏗️  Fazendo build..."
pnpm build

# ─── 10. Instalar PM2 para manter o servidor rodando ───
echo "🔄 Instalando PM2..."
sudo npm install -g pm2

# ─── 11. Criar script de start com PM2 ───
echo "📝 Criando script de inicialização..."
cat > ecosystem.config.js << 'ECOSYS'
module.exports = {
  apps: [{
    name: 'devai-assistant',
    script: 'dist/server/_core/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
ECOSYS

# ─── 12. Configurar PM2 para iniciar no boot ───
echo "⚙️  Configurando auto-start..."
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# ─── 13. Configurar Nginx como reverse proxy ───
echo "🌐 Configurando Nginx..."
sudo apt install -y nginx

cat > /etc/nginx/sites-available/devai << 'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        client_max_body_size 100m;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/devai /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ─── 14. Configurar SSL com Let's Encrypt (opcional) ───
echo "🔒 Configurando SSL (se domínio configurado)..."
sudo apt install -y certbot python3-certbot-nginx

# ─── Resumo ───
echo ""
echo "============================================================"
echo "✅ Instalação concluída!"
echo "============================================================"
echo ""
echo "📋 Próximos passos:"
echo "  1. Edite o .env com suas chaves:"
echo "     nano /home/ubuntu/dev-ai-assistant/.env"
echo ""
echo "  2. Inicie o servidor:"
echo "     cd /home/ubuntu/dev-ai-assistant"
echo "     pm2 start ecosystem.config.js"
echo ""
echo "  3. Acesse: http://SEU_IP"
echo ""
echo "🔧 Comandos úteis:"
echo "  pm2 logs devai-assistant    - Ver logs"
echo "  pm2 restart devai-assistant - Reiniciar"
echo "  pm2 stop devai-assistant    - Parar"
echo "  pnpm dev                    - Rodar em modo desenvolvimento"
echo ""
echo "🤖 Para auto-melhoria:"
echo "  A IA vai automaticamente clonar, modificar, testar 5x e pushar"
echo ""
echo "📁 Ferramentas de análise instaladas:"
echo "  file, strings, hexdump, unzip, exiftool"
echo ""
