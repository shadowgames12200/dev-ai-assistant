# Guia: DevAI Assistant na Oracle Cloud (Computador Completo Grátis)

Este guia explica como colocar o DevAI Assistant em uma VM na Oracle Cloud com capacidade de auto-melhoria.

---

## Passo 1: Criar conta na Oracle Cloud

1. Acesse: https://www.oracle.com/cloud/free/
2. Clique em "Start for free"
3. Preencha os dados (nome, email, telefone, cartão de crédito — não será cobrado)
4. Confirme o email

---

## Passo 2: Criar a VM (Compute Instance)

1. No painel da Oracle Cloud, vá em **Compute → Instances**
2. Clique em **Create Instance**
3. Configure:
   - **Name:** `devai-assistant`
   - **Image:** Ubuntu 24.04
   - **Shape:** VM.Standard.A1.Flex (ARM) — sempre grátis
   - **OCPUs:** 2
   - **Memory (GB):** 12
   - **Boot Volume:** 50 GB (padrão)

4. Em **Add SSH Keys**, escolha "Generate a key pair" e baixe o arquivo `.key`

5. Clique em **Create**

---

## Passo 3: Configurar a rede (abrir porta 80)

1. Clique na VM criada → **Subnet** → **Default Security List**
2. Clique no **Ingress Rules** → **Add Ingress Rules**
3. Configure:
   - **Source CIDR:** `0.0.0.0/0`
   - **Destination Port Range:** `80`
   - **Protocol:** TCP
4. Salve

---

## Passo 4: Conectar via SSH (do celular ou PC)

### Pelo celular (Termux):
```bash
# Instalar Termux no celular (F-Droid)
# Dentro do Termux:
pkg install openssh

# Copiar a chave SSH para o Termux
# Depois conectar:
ssh -i ~/.ssh/oracle_key ubuntu@SEU_IP_PUBLICO
```

### Pelo PC (Windows):
```bash
# Usar PuTTY ou o terminal:
ssh -i sua_chave.pem ubuntu@SEU_IP_PUBLICO
```

### Pelo PC (Linux/Mac):
```bash
chmod 400 sua_chave.pem
ssh -i sua_chave.pem ubuntu@SEU_IP_PUBLICO
```

---

## Passo 5: Instalar o DevAI (1 comando)

Após conectar via SSH, rode:

```bash
sudo apt install -y wget
wget https://raw.githubusercontent.com/shadowgames12200/dev-ai-assistant/main/setup-ubuntu.sh
chmod +x setup-ubuntu.sh
sudo ./setup-ubuntu.sh
```

O script faz TUDO automaticamente:
- Instala Node.js, pnpm, git
- Instala ferramentas de análise (file, strings, hexdump, unzip, exiftool)
- Clona o repositório
- Instala dependências
- Configura Nginx
- Configura PM2 para rodar em segundo plano
- Configura auto-start

---

## Passo 6: Configurar as variáveis de ambiente

```bash
nano /home/ubuntu/dev-ai-assistant/.env
```

Preencha:
```env
# GROQ API KEY (obter em https://console.groq.com/keys)
GROQ_API_KEY=gsk_xxxxxxxx

# Database URL (usar Neon ou Supabase)
DATABASE_URL=postgresql://usuario:senha@host/banco

# GitHub Token (para auto-melhoria - gerar em https://github.com/settings/tokens)
GITHUB_TOKEN=ghp_xxxxxxxx
```

---

## Passo 7: Iniciar o servidor

```bash
cd /home/ubuntu/dev-ai-assistant
pm2 start ecosystem.config.js
```

Acesse: `http://SEU_IP_PUBLICO`

---

## Como funciona a Auto-Melhoria

Quando você pede para a IA melhorar algo, ela vai:

1. **Clonar** o repositório em um diretório temporário
2. **Implementar** as mudanças nos arquivos
3. **Rodar testes 5 vezes** (build + npm test)
4. **Se TODOS os 5 testes passarem** → faz `git commit` e `git push`
5. **Se algum teste falhar** → reverte as mudanças e te avisa

### Comandos úteis:
```bash
# Ver se o servidor está rodando
pm2 status

# Ver logs em tempo real
pm2 logs devai-assistant

# Reiniciar após update
./update.sh

# Ver ferramentas disponíveis
which file strings hexdump unzip
```

---

## Banco de Dados Grátis

Use um desses para o banco de dados (PostgreSQL grátis):

| Serviço | Link | Gratuidade |
|---------|------|------------|
| Neon | https://neon.tech | 3GB grátis |
| Supabase | https://supabase.com | 500MB grátis |
| Aiven | https://aiven.io | PostgreSQL grátis |

A URL fica no formato: `postgresql://usuario:senha@host:5432/banco`

---

## Diferenças: Vercel vs Oracle Cloud

| Funcionalidade | Vercel (atual) | Oracle Cloud |
|---------------|----------------|-------------|
| Upload de arquivos | 4.5MB máximo | Sem limite |
| Análise de ZIPs | Parser JS | Tools do sistema (file, unzip) |
| Auto-melhoria | Impossível | Clone, editar, testar, push |
| Execução de comandos | Não | Sim (file, strings, hexdump) |
| Timeout | 60 segundos | Sem limite |
| Deploy automático | Sim (GitHub) | Manual (`./update.sh`) |
| Custo | Grátis | Grátis |

---

## Se quiser continuar no Vercel

Tudo que implementei (análise de ZIPs por JS, file-analyzer.ts) funciona no Vercel. O self-improvement só funciona na VM, mas a análise de arquivos funciona em qualquer lugar.
