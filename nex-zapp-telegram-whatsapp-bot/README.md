# NEX-ZAPP Telegram + WhatsApp Bot

Bot no Telegram para controlar disparos pelo WhatsApp.

## Como instalar

```bash
cd /root
unzip nex-zapp-telegram-whatsapp-bot.zip
cd nex-zapp-telegram-whatsapp-bot
cp .env.example .env
nano .env
npm install
npm start
```

No `.env`, coloque:

```env
TELEGRAM_BOT_TOKEN=token_do_botfather
```

## Rodar com PM2

```bash
pm2 start ecosystem.config.js
pm2 save
```

## O que esta primeira versão faz

- Bot Telegram como painel do cliente.
- Conectar WhatsApp 01, 02 e 03.
- Enviar QR Code no Telegram.
- Status das sessões.
- Disparo em lista.
- Disparo em grupos.
- Campanha A/B/C criada na hora.
- Texto, foto, vídeo e documento.
- Vídeo com fallback para documento.
- Correção de número sem 55 e com/sem 9.
- Delay configurável no .env.

## Próximas etapas

Depois podemos adicionar:
- Admin pelo Telegram.
- Revenda pelo Telegram.
- Pedidos e aprovação.
- PIX automático por conversa.
