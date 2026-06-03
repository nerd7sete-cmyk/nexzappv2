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


## Rebuild V3 - Disparo e Mídia Fix

Correções:
- Corrigido envio em branco no disparo em grupos.
- Corrigido nome dos campos gMsg/gMedia.
- Foto e vídeo agora são enviados como arquivo/buffer no Baileys.
- Validação antes do disparo para evitar campanha vazia.
- Lista inteligente: aceita números com ou sem 55 e tenta com/sem 9.
- Planilhas aceitam colunas telefone, Telefone, numero, número, celular, WhatsApp.
- Adicionadas explicações nas abas de anúncios, lista e grupos.
- Variáveis visíveis para copiar: {nome}, {telefone}, {pedido}, {plano}, {empresa}, {data}.

## Rebuild V4 - Landing, Anúncios e Vídeo Fix

- Login removido da landing inicial.
- Botão "Entrar agora" abre modal de login.
- Senha/admin não fica exposto na página pública.
- Área "Quero ser revendedor" visível na landing.
- Modal de revendedor melhorado.
- Anúncios do cliente validam texto/mídia e salvam corretamente.
- Campos de anúncio limpam após salvar.
- Envio de vídeo tenta como vídeo e, se falhar, reenvia como documento.

## Rebuild V5 - Grupos por WhatsApp + Landing Dark + Vídeo

- Aba de grupos agora vincula cada grupo ao WhatsApp que carregou.
- Grupos do WhatsApp 01 são enviados somente pelo WhatsApp 01.
- Grupos do WhatsApp 02 são enviados somente pelo WhatsApp 02.
- Grupos do WhatsApp 03 são enviados somente pelo WhatsApp 03.
- Cada grupo mostra o WhatsApp responsável.
- Landing page em tema dark mais limpo.
- Removido card "Acesse quando precisar".
- Mantidos botões Comprar agora, Entrar agora e Quero ser revendedor.
- Vídeos: tenta enviar como vídeo e, se falhar, envia como documento.
- Melhor suporte para MP4, MOV, AVI, MKV, WEBM, M4V e 3GP conforme aceitação do WhatsApp.

## Rebuild V8 - Cliente Limpo Funcional

- Painel cliente refeito limpo.
- Aba WhatsApps sempre mostra WhatsApp 01, 02 e 03.
- Menus corrigidos: Início, WhatsApps, Anúncios, Lista, Grupos e Planos.
- Anúncios salvando texto, foto, vídeo e documento.
- Disparo em lista com mídia.
- Disparo em grupos por WhatsApp responsável.
- Seleção de grupos salva no cache por WhatsApp.
- Renovação com modal PIX e WhatsApp do comprovante configurado pelo admin.
- Vídeo com fallback como documento.

## Rebuild V8.1 - Correção das Rotas do Painel Cliente

- Adicionadas rotas faltantes:
  - GET /sessions
  - POST /connect
  - POST /reset
  - GET /groups/:session
  - GET /ads
  - POST /ads
  - DELETE /ads/:id
- Botões Conectar/Reiniciar/Desconectar agora chamam backend correto.
- Aba WhatsApps mostra status e QR Code.
- Painel cliente mantém layout limpo da V8.


## NEX-ZAPP Clean V2 - Sem Anúncios Salvos

Esta versão remove completamente a função de anúncios salvos.

Agora o fluxo é:
- Disparo em lista com Anúncio A, B e C criados na hora.
- Disparo em grupos com Anúncio A, B e C criados na hora.
- Cada anúncio pode ter texto, foto, vídeo ou documento.
- O sistema alterna automaticamente entre A/B/C.
- Se preencher apenas o Anúncio A, envia só o A.
- Vídeo é enviado como vídeo.
- Se o WhatsApp recusar o vídeo, envia como documento automaticamente.
- Grupos continuam separados por WhatsApp.
- Cache de grupos mantido.
- PIX, revenda, admin e cliente mantidos.
