# NEX-ZAPP Rebuild V1

Sistema recriado do zero com estrutura limpa.

## Login padrão
Admin: `admin@nexzapp.local`
Senha: `admin123`

## Rodar local/VPS
```bash
npm install
npm start
```

## PM2
```bash
pm2 start ecosystem.config.js
pm2 save
```

## Recursos
- Landing page com planos dinâmicos
- Cliente cria senha na compra
- PIX com comprovante por WhatsApp
- Admin completo
- Pedidos pendentes, aprovar/recusar
- Planos/valores editáveis
- Revendedores, comissão e saques
- Multi WhatsApp com QR e reconexão
- Disparo lista com texto/foto/vídeo/documento
- Upload de planilha
- Disparo em grupos
- Criar 3 anúncios na hora A/B/C
- Usar anúncios salvos
- Misturar anúncios criados + salvos
- Spintax: `{Oi|Olá|Fala}`
- Variáveis: `{nome}`, `{telefone}`, `{pedido}`, `{plano}`, `{empresa}`, `{data}`, `{grupo}`
- Mobile e desktop responsivos
- iPhone sem zoom
- Pasta única `data/`


## Rebuild V2 UI Premium

Atualização visual:
- Ícones SVG profissionais, sem emojis.
- Cards separados para WhatsApp 01, 02 e 03.
- Status visual por sessão: conectado, conectando/QR, desconectado.
- Etapas de conexão com loader animado.
- Explicações para o cliente entender o fluxo.
- Dashboard com cards mais informativos e barra de progresso.
- Menu com ícones.
- Landing com cards de recursos.
- Admin e revenda com ícones nos cards.
