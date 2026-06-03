# NEX-ZAPP CLEAN FINAL

Estrutura limpa:

- server.js
- package.json
- ecosystem.config.js
- public/
  - landing.html
  - app.html
  - admin.html
  - revenda.html
- data/
- uploads/
- auth/

## Rodar local/VPS

```bash
cd /root/NEXAPP/nex-zapp-clean-final
npm install
pm2 delete nexzapp || true
pm2 start server.js --name nexzapp
pm2 save
```

## Acessos

- Landing: https://nexzapp.com.br/
- Cliente: https://nexzapp.com.br/app
- Admin: https://nexzapp.com.br/admin
- Revenda: https://nexzapp.com.br/revenda

## Admin padrão

- E-mail: admin@nexzapp.local
- Senha: admin123

Troque a senha no arquivo data/users.json após o primeiro acesso.

## Correções incluídas

- Ícones SVG no lugar de emoji.
- Painel cliente limpo.
- WhatsApp 01, 02 e 03.
- Botão conectar, reset e status.
- QR Code.
- Rotas backend alinhadas com frontend:
  - /sessions
  - /connect
  - /reset
  - /groups/:session
  - /ads
  - /campaign
  - /campaign-groups
- Anúncios salvos.
- Foto, vídeo e documento.
- Vídeo com fallback para documento.
- Disparo por lista.
- Disparo em grupos por WhatsApp responsável.
- Cache de seleção dos grupos.
- Renovação PIX.
- Comprovante pelo WhatsApp configurado no admin.
- Revenda e login de revendedor.
- Landing dark com login por modal.
