# NEX-ZAPP Pro V18 Ajustado

Correções desta versão:
- Cada plano agora tem validade própria em dias (`durationDays`).
- Admin > Planos permite editar a validade de cada plano.
- Novo cliente no admin calcula vencimento conforme o plano escolhido.
- Aprovação de pedido da landing usa a validade do plano escolhido.
- Renovação pelo admin usa a validade do plano atual do cliente.
- Painel do cliente > Planos e renovação mostra os três planos para escolher.
- Ao renovar, o cliente gera PIX do plano escolhido, não apenas do plano atual.

Padrão inicial:
- Starter: 30 dias
- Pro: 60 dias
- Enterprise: 90 dias

Login admin:
admin@nexzapp.local
admin123

Cliente demo:
cliente@nexzapp.local
123456


## Atualização - Lista inteligente

- Disparo em lista aceita arquivo TXT, CSV, XLSX e XLS.
- Sistema tenta corrigir números sem 55.
- Sistema tenta corrigir números BR sem 9º dígito.
- CSV/XLSX pode conter colunas: whatsapp, telefone, celular, numero, nome, pedido etc.
- Variáveis das colunas podem ser usadas na mensagem: {nome}, {pedido}.


## Atualização V19 - Revenda

- Landing com seção "Quero ser revendedor".
- Cadastro de revendedor cai no Admin como pendente.
- Painel do revendedor em `/revenda`.
- Revendedor aprovado recebe código e link `/?ref=CODIGO`.
- Compra pela landing usando `?ref=` gera comissão após aprovação do pedido.
- Admin controla revendedores, comissões e saques.
- Revendedor solicita saque via PIX.
- Admin marca saque como pago após fazer PIX manual.


## V20 Revenda Admin
- Revendedor cria a própria senha na landing.
- Removido aviso de senha inicial.
- Admin tem área de Revendedores.
- Admin aprova/bloqueia revendedor.
- Admin configura comissão por plano.
- Admin configura saque mínimo.
- Admin vê e aprova saques dos revendedores.


## V22 Revenda Premium

- Corrigido menu `undefinedRevendedores`.
- Adicionado ícone profissional no menu Revendedores.
- Tela Admin Revendedores melhorada.
- Comissão agora pode ser porcentagem (%) ou valor fixo (R$).
- Status visual: Pendente, Ativo, Bloqueado, Cancelado.
- Ações mudam conforme status do revendedor.
- Cards de resumo: ativos, pendentes, comissão gerada e saques pendentes.
- Tabela mostra indicações, comissão total, disponível e pago por revendedor.


## V24 Correções

- Corrigido erro `planDurationDays is not defined`.
- PIX da landing volta a gerar pedido normalmente.
- Compra com link de revenda `?ref=CODIGO` salva o código no pedido.
- Adicionado botão X no login do revendedor para voltar para a landing.


## V32 Base V24 Pedidos OK

- Base restaurada em cima da V24, onde os pedidos apareciam.
- Removidas tentativas de cards/forçado da V29/V30.
- Mantida tabela original de Pedidos da Landing.
- Pedidos pendentes aparecem por `state.orders`.
- Botão Aprovar some após aprovação.
- Botão Recusar adicionado.
- PIX com WhatsApp de comprovantes e frase ajustada.


## V33 Botões Pedidos Fix

- Corrigido botão Aprovar da aba Pedidos da Landing.
- Corrigido botão Recusar da aba Pedidos da Landing.
- Backend agora compara ID do pedido como texto.
- Aprovar cria/libera cliente, registra pagamento e atualiza pedido.
- Recusar marca pedido como cancelado.
- Tela recarrega a lista após ação.


## V35 Comissão Revenda Fix

- Corrigido erro `createCommissionForOrder is not defined`.
- Ao aprovar pedido vindo com `refCode`, o sistema procura o revendedor.
- Calcula comissão por porcentagem ou valor fixo conforme `reseller-settings.json`.
- Salva a comissão em `commissions.json`.
- Evita comissão duplicada para o mesmo pedido.


## V36 VPS nexzapp.com.br

- Preparado para domínio `nexzapp.com.br`.
- Adicionado `ecosystem.config.js` para PM2.
- Adicionado `nginx-nexzapp.conf`.
- Adicionado `deploy.sh`.
- Adicionado `README_DEPLOY_VPS.md`.
- Scripts `start` e `prod` ajustados.


## V39 Base V36 Corrigida

Base usada: V36 funcionando.

Aplicado somente:
- Correção mobile no admin e cliente.
- Correção de zoom no iPhone.
- Barra inferior mobile compacta.
- Tabelas viram cards no celular.
- Ajuste de estabilidade/reconexão WhatsApp.
- Polling do painel menos agressivo.

Não foi alterado:
- Fluxo de pedidos.
- Salvamento de PIX/configurações.
- Landing/revenda/pagamentos.


## V40 Funcionando Tudo

Correções aplicadas:
- Login do cliente aceita senha sem espaços acidentais.
- Senha escolhida na landing é salva no pedido.
- Ao aprovar pedido, novo cliente usa a senha escolhida.
- Se cliente já existir, a senha é atualizada para a senha escolhida no pedido.
- Landing tem confirmar senha e mínimo de 6 caracteres.
- PIX/configurações salvam em `data/settings.json`.
- WhatsApp para comprovantes salva e recarrega.
- Planos/valores salvam em `data/plans.json`.
- Landing salva em `data/landing.json`.
- Adicionado diagnóstico `/api/admin/diagnostic` para conferir pasta real de dados.
- Mantida base V39/V36 com mobile e WhatsApp estável.


## V41 Ajustes Gerais

- Pedidos pendentes corrigidos no desktop do admin.
- Seleção de WhatsApp no mobile fica automática quando houver instância conectada.
- Disparo em grupos no desktop mostra Criar conteúdo agora.
- Botão para salvar campanha criada na hora como anúncio.
- Resultado técnico JSON escondido; agora mostra resumo amigável.
- Botão de olho para visualizar senha nos logins e landing.
- WhatsApp tenta ficar como presença indisponível para reduzir impacto nas notificações do celular.
- Mantidas correções da V40: PIX, senha, planos, landing e mobile.
