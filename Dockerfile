# Use a imagem oficial do Node.js
FROM node:20-slim

# Instalar pnpm e dependências de sistema necessárias
RUN npm install -g pnpm && \
    apt-get update && apt-get install -y git python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de configuração de dependências
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Instalar dependências (incluindo devDependencies para o build)
RUN pnpm install

# Copiar o restante do código
COPY . .

# Build do Frontend (Vite) e Backend (TypeScript)
RUN pnpm run build

# O Hugging Face usa a porta 7860 por padrão
ENV PORT=7860
EXPOSE 7860

# Comando para iniciar a aplicação
# Nota: Ajustamos para rodar o servidor que serve o frontend e a API
CMD ["node", "dist/server/_core/index.js"]
