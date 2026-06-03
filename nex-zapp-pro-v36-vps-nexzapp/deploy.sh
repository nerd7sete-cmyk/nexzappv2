#!/bin/bash
set -e

APP_DIR="/var/www/nex-zapp"
DOMAIN="nexzapp.com.br"

echo "== NEX-ZAPP Deploy =="
echo "App: $APP_DIR"
echo "Domain: $DOMAIN"

if [ ! -d "$APP_DIR" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R $USER:$USER "$APP_DIR"
fi

echo "1) Instalando dependências..."
npm install --production

echo "2) Criando pasta data se não existir..."
mkdir -p data

echo "3) Subindo com PM2..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete nex-zapp || true
  pm2 start ecosystem.config.js
  pm2 save
else
  echo "PM2 não encontrado. Instale com: npm install -g pm2"
fi

echo "Deploy finalizado."
echo "Acesse: https://$DOMAIN"
