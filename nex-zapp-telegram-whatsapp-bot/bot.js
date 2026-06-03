
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')
const mime = require('mime-types')
const P = require('pino')
const { Boom } = require('@hapi/boom')
const { Telegraf, Markup } = require('telegraf')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys')

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TOKEN || TOKEN.includes('COLOQUE')) {
  console.error('Configure TELEGRAM_BOT_TOKEN no arquivo .env')
  process.exit(1)
}

const APP_NAME = process.env.APP_NAME || 'NEX-ZAPP'
const ROOT = __dirname
const DATA = path.join(ROOT, 'data')
const UPLOADS = path.join(ROOT, 'uploads')
const AUTH = path.join(ROOT, 'auth')
for (const d of [DATA, UPLOADS, AUTH]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })

const files = {
  users: path.join(DATA, 'users.json'),
  campaigns: path.join(DATA, 'campaigns.json'),
  groups: path.join(DATA, 'groups.json'),
  settings: path.join(DATA, 'settings.json'),
  logs: path.join(DATA, 'logs.json')
}

function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
function write(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)) }
function uid(p='id') { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function onlyNum(s) { return String(s || '').replace(/\D/g, '') }
function now() { return new Date().toISOString() }
function minDelay() { return Number(process.env.MIN_DELAY || 8000) }
function maxDelay() { return Number(process.env.MAX_DELAY || 18000) }
function clampText(s, n=3500) { s = String(s || ''); return s.length > n ? s.slice(0,n) + '\n...' : s }

function init() {
  if (!fs.existsSync(files.users)) write(files.users, [])
  if (!fs.existsSync(files.campaigns)) write(files.campaigns, [])
  if (!fs.existsSync(files.groups)) write(files.groups, {})
  if (!fs.existsSync(files.logs)) write(files.logs, [])
  if (!fs.existsSync(files.settings)) write(files.settings, {
    pixKey: 'configure-sua-chave-pix',
    supportWhatsapp: '5511999999999',
    plans: [
      { id: 'starter', name: 'Starter', price: 49.90, days: 30, whatsappLimit: 1 },
      { id: 'pro', name: 'Pro', price: 97.90, days: 60, whatsappLimit: 3 },
      { id: 'enterprise', name: 'Enterprise', price: 197.90, days: 90, whatsappLimit: 10 }
    ]
  })
}
init()

const bot = new Telegraf(TOKEN)
const sessions = {}
const flows = {}

function waDisplay(name) {
  return ({ whatsapp1:'WhatsApp 01', whatsapp2:'WhatsApp 02', whatsapp3:'WhatsApp 03' }[name] || name)
}
function safeName(n) { return String(n || 'whatsapp1').replace(/[^a-z0-9_-]/gi, '') || 'whatsapp1' }
function authPath(n) { return path.join(AUTH, safeName(n)) }
function sess(n) {
  n = safeName(n)
  if (!sessions[n]) sessions[n] = {
    name: n, label: waDisplay(n), sock: null, qr: null, connected: false,
    starting: false, stage: 'offline', lastSeen: null, logs: [], reconnectTimer: null,
    reconnectAttempts: 0, manualStop: false, sentToday: 0
  }
  return sessions[n]
}
function log(n, msg) {
  const s = sess(n)
  const line = '[' + new Date().toLocaleTimeString() + '] ' + msg
  s.logs.unshift(line)
  s.logs = s.logs.slice(0, 60)
  console.log('[' + waDisplay(n) + '] ' + msg)
}

async function connectWhatsApp(name, notifyChatId=null) {
  name = safeName(name)
  const s = sess(name)
  s.manualStop = false
  if (s.starting) return
  if (s.connected && s.sock) return

  s.starting = true
  s.stage = 'starting'
  s.qr = null

  const { state, saveCreds } = await useMultiFileAuthState(authPath(name))
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: [APP_NAME, 'Chrome', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    shouldSyncHistoryMessage: () => false
  })

  s.sock = sock
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async update => {
    const { connection, qr, lastDisconnect } = update
    if (qr) {
      s.qr = await QRCode.toDataURL(qr)
      s.stage = 'qr'
      s.starting = false
      s.connected = false
      log(name, 'QR gerado.')
      if (notifyChatId) {
        const buffer = Buffer.from(s.qr.split(',')[1], 'base64')
        await bot.telegram.sendPhoto(notifyChatId, { source: buffer }, { caption: `${waDisplay(name)}: leia este QR Code no WhatsApp.` })
      }
    }

    if (connection === 'connecting') s.stage = s.qr ? 'qr' : 'starting'

    if (connection === 'open') {
      s.connected = true
      s.starting = false
      s.qr = null
      s.stage = 'connected'
      s.lastSeen = new Date().toLocaleString('pt-BR')
      s.reconnectAttempts = 0
      if (s.reconnectTimer) clearTimeout(s.reconnectTimer)
      try { await sock.sendPresenceUpdate('unavailable') } catch {}
      log(name, 'Conectado.')
      if (notifyChatId) await bot.telegram.sendMessage(notifyChatId, `${waDisplay(name)} conectado com sucesso.`, mainMenu())
    }

    if (connection === 'close') {
      s.connected = false
      s.starting = false
      const err = lastDisconnect?.error
      const code = err instanceof Boom ? err.output.statusCode : err?.output?.statusCode
      log(name, 'Conexão fechada. Código ' + (code || 'sem código'))

      if (code === DisconnectReason.loggedOut || code === 401 || code === 405) {
        try { fs.rmSync(authPath(name), { recursive: true, force: true }) } catch {}
        s.stage = 'error'
        s.manualStop = true
        if (notifyChatId) await bot.telegram.sendMessage(notifyChatId, `${waDisplay(name)} saiu da sessão. Gere novo QR.`)
        return
      }

      scheduleReconnect(name)
    }
  })
}

function scheduleReconnect(name) {
  const s = sess(name)
  if (s.manualStop) return
  if (s.reconnectTimer) clearTimeout(s.reconnectTimer)
  s.stage = 'reconnecting'
  s.reconnectAttempts = Math.min((s.reconnectAttempts || 0) + 1, 10)
  const ms = Math.min(45000, 2000 * s.reconnectAttempts)
  s.reconnectTimer = setTimeout(() => {
    s.reconnectTimer = null
    s.sock = null
    connectWhatsApp(name).catch(e => log(name, 'Erro reconexão: ' + e.message))
  }, ms)
}

setInterval(() => {
  for (const n of ['whatsapp1', 'whatsapp2', 'whatsapp3']) {
    const s = sess(n)
    if (fs.existsSync(authPath(n)) && !s.connected && !s.starting && !s.reconnectTimer && s.stage !== 'qr' && s.stage !== 'error') {
      scheduleReconnect(n)
    }
  }
}, 60000)

function normalizeBR(raw) {
  let n = onlyNum(raw)
  const set = new Set()
  const add = v => {
    v = onlyNum(v)
    if (v.length >= 10 && v.length <= 15) set.add(v)
  }
  if (!n) return []
  if (n.startsWith('00')) n = n.slice(2)
  if (!n.startsWith('55')) {
    if (n.length === 11) add('55' + n)
    if (n.length === 10) {
      add('55' + n)
      add('55' + n.slice(0, 2) + '9' + n.slice(2))
    }
  }
  add(n)
  if (n.startsWith('55') && n.length === 12) add('55' + n.slice(2, 4) + '9' + n.slice(4))
  if (n.startsWith('55') && n.length === 13 && n[4] === '9') add('55' + n.slice(2, 4) + n.slice(5))
  return [...set]
}

function applyVars(text, vars) {
  let out = String(text || '')
  out = out.replace(/\{([^{}|]+)\}/g, (m, k) => vars[k] ?? m)
  out = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (m, g) => {
    const arr = g.split('|')
    return arr[Math.floor(Math.random() * arr.length)]
  })
  return out
}

async function sendToTarget(sessionName, jid, ad, vars={}) {
  const s = sess(sessionName)
  if (!s.connected || !s.sock) throw new Error(waDisplay(sessionName) + ' não conectado')

  const caption = applyVars(ad.text || '', vars)
  let payload

  if (ad.filePath && fs.existsSync(ad.filePath)) {
    const mimetype = ad.mimetype || mime.lookup(ad.filePath) || 'application/octet-stream'
    const buffer = fs.readFileSync(ad.filePath)
    if (mimetype.startsWith('image/')) payload = { image: buffer, mimetype, caption }
    else if (mimetype.startsWith('video/')) payload = { video: buffer, mimetype, caption }
    else payload = { document: buffer, mimetype, fileName: ad.fileName || path.basename(ad.filePath), caption }
  } else {
    if (!caption.trim()) throw new Error('Mensagem vazia.')
    payload = { text: caption }
  }

  try {
    await s.sock.sendMessage(jid, payload)
  } catch (e) {
    if (payload.video) {
      const doc = { document: payload.video, mimetype: payload.mimetype || 'video/mp4', fileName: ad.fileName || 'video.mp4', caption: payload.caption || '' }
      await s.sock.sendMessage(jid, doc)
    } else throw e
  }

  try { await s.sock.sendPresenceUpdate('unavailable') } catch {}
  s.sentToday = (s.sentToday || 0) + 1
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Conectar WhatsApp', 'wa_menu')],
    [Markup.button.callback('Disparo em Lista', 'list_start')],
    [Markup.button.callback('Disparo em Grupos', 'groups_start')],
    [Markup.button.callback('Status', 'status')],
    [Markup.button.callback('Planos/Renovar', 'plans')]
  ])
}
function cancelMenu() { return Markup.inlineKeyboard([[Markup.button.callback('Cancelar', 'cancel')]]) }
function adMediaMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Pular mídia', 'ad_skip_media')],
    [Markup.button.callback('Finalizar campanha', 'ad_finish')],
    [Markup.button.callback('Cancelar', 'cancel')]
  ])
}
function nextAdMenu(label) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`Adicionar Anúncio ${label}`, 'ad_next')],
    [Markup.button.callback('Finalizar e revisar', 'ad_finish')],
    [Markup.button.callback('Cancelar', 'cancel')]
  ])
}
function confirmMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Confirmar envio', 'confirm_send')],
    [Markup.button.callback('Cancelar', 'cancel')]
  ])
}
function waMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('WhatsApp 01', 'wa_whatsapp1')],
    [Markup.button.callback('WhatsApp 02', 'wa_whatsapp2')],
    [Markup.button.callback('WhatsApp 03', 'wa_whatsapp3')],
    [Markup.button.callback('Voltar', 'menu')]
  ])
}
function sessionMenu(prefix='sel') {
  return Markup.inlineKeyboard([
    [Markup.button.callback('WhatsApp 01', `${prefix}_whatsapp1`)],
    [Markup.button.callback('WhatsApp 02', `${prefix}_whatsapp2`)],
    [Markup.button.callback('WhatsApp 03', `${prefix}_whatsapp3`)],
    [Markup.button.callback('Cancelar', 'cancel')]
  ])
}
function statusText() {
  return ['whatsapp1','whatsapp2','whatsapp3'].map(n => {
    const s = sess(n)
    return `${waDisplay(n)}\nStatus: ${s.connected ? 'Conectado' : (s.stage || 'offline')}\nÚltima atividade: ${s.lastSeen || '-'}\nEnvios hoje: ${s.sentToday || 0}`
  }).join('\n\n')
}
function labelFor(i) { return ['A','B','C'][i] || String(i+1) }

async function registerUser(ctx) {
  const users = read(files.users, [])
  const id = String(ctx.from.id)
  if (!users.find(u => u.telegramId === id)) {
    users.push({ id: uid('user'), telegramId: id, name: ctx.from.first_name || 'Cliente', role: 'client', status: 'active', createdAt: now() })
    write(files.users, users)
  }
}

bot.start(async ctx => {
  await registerUser(ctx)
  await ctx.reply(`${APP_NAME}\n\nEscolha uma opção:`, mainMenu())
})

bot.action('menu', async ctx => {
  await ctx.answerCbQuery()
  delete flows[ctx.from.id]
  await ctx.editMessageText(`${APP_NAME}\n\nEscolha uma opção:`, mainMenu()).catch(() => ctx.reply(`${APP_NAME}\n\nEscolha uma opção:`, mainMenu()))
})
bot.action('cancel', async ctx => {
  await ctx.answerCbQuery()
  delete flows[ctx.from.id]
  await ctx.reply('Operação cancelada.', mainMenu())
})
bot.action('status', async ctx => {
  await ctx.answerCbQuery()
  await ctx.reply(statusText(), mainMenu())
})
bot.action('wa_menu', async ctx => {
  await ctx.answerCbQuery()
  await ctx.editMessageText('Escolha qual WhatsApp deseja conectar:', waMenu()).catch(() => ctx.reply('Escolha qual WhatsApp deseja conectar:', waMenu()))
})
bot.action(/^wa_(whatsapp\d)$/, async ctx => {
  await ctx.answerCbQuery()
  const name = ctx.match[1]
  await ctx.reply(`Iniciando conexão do ${waDisplay(name)}. Aguarde o QR Code...`)
  connectWhatsApp(name, ctx.chat.id).catch(e => ctx.reply('Erro ao conectar: ' + e.message))
})

bot.action('list_start', async ctx => {
  await ctx.answerCbQuery()
  flows[ctx.from.id] = { type: 'list', step: 'session', ads: [], targets: [] }
  await ctx.reply('Escolha o WhatsApp que fará o disparo em lista:', sessionMenu('listwa'))
})
bot.action(/^listwa_(whatsapp\d)$/, async ctx => {
  await ctx.answerCbQuery()
  const f = flows[ctx.from.id] = { type: 'list', ads: [], targets: [], session: ctx.match[1], step: 'targets' }
  await ctx.reply(
    `WhatsApp escolhido: ${waDisplay(f.session)}\n\nEnvie a lista de contatos agora.\n\nPode colar um número por linha:\n11999999999\n11988887777\n\nDepois disso vou pedir Anúncio A/B/C.`,
    cancelMenu()
  )
})

bot.action('groups_start', async ctx => {
  await ctx.answerCbQuery()
  flows[ctx.from.id] = { type: 'groups', step: 'session', ads: [] }
  await ctx.reply('Escolha o WhatsApp para carregar os grupos:', sessionMenu('groupwa'))
})
bot.action(/^groupwa_(whatsapp\d)$/, async ctx => {
  await ctx.answerCbQuery()
  const session = ctx.match[1]
  const s = sess(session)
  if (!s.connected || !s.sock) return ctx.reply(`${waDisplay(session)} não está conectado.`, mainMenu())

  await ctx.reply('Carregando grupos...')
  try {
    const all = await s.sock.groupFetchAllParticipating()
    const groups = Object.values(all || {}).map(g => ({
      id: g.id,
      name: g.subject || g.id,
      participants: Array.isArray(g.participants) ? g.participants.length : (g.size || 0)
    })).sort((a,b)=>a.name.localeCompare(b.name))

    const f = flows[ctx.from.id] = { type:'groups', step:'select_groups', session, groups, ads: [] }
    if (!groups.length) return ctx.reply('Nenhum grupo encontrado.', mainMenu())

    const text = groups.slice(0,100).map((g,i)=>`${i+1}. ${g.name} (${g.participants})`).join('\n')
    await ctx.reply(clampText(`Escolha os grupos enviando os números separados por vírgula.\n\nExemplo: 1,3,8\n\n${text}`), cancelMenu())
  } catch(e) {
    await ctx.reply('Erro ao carregar grupos: '+e.message, mainMenu())
  }
})

bot.action('ad_skip_media', async ctx => {
  await ctx.answerCbQuery()
  const f = flows[ctx.from.id]
  if (!f || f.step !== 'ad_media') return ctx.reply('Nenhuma mídia pendente.', mainMenu())
  await nextAdOrConfirm(ctx, f)
})
bot.action('ad_next', async ctx => {
  await ctx.answerCbQuery()
  const f = flows[ctx.from.id]
  if (!f) return ctx.reply('Nenhuma campanha em andamento.', mainMenu())
  if (f.currentAd >= 3) return confirmCampaign(ctx, f)
  f.step = 'ad_text'
  await ctx.reply(`Envie o texto do Anúncio ${labelFor(f.currentAd)}.`, cancelMenu())
})
bot.action('ad_finish', async ctx => {
  await ctx.answerCbQuery()
  const f = flows[ctx.from.id]
  if (!f) return ctx.reply('Nenhuma campanha em andamento.', mainMenu())
  await confirmCampaign(ctx, f)
})

bot.on('text', async ctx => {
  await registerUser(ctx)
  const f = flows[ctx.from.id]
  if (!f) {
    await ctx.reply('Escolha uma opção:', mainMenu())
    return
  }

  const text = String(ctx.message.text || '').trim()

  if (text.toUpperCase() === 'CANCELAR') {
    delete flows[ctx.from.id]
    await ctx.reply('Operação cancelada.', mainMenu())
    return
  }

  if (f.type === 'list') {
    if (f.step === 'targets') {
      f.targets = text.split(/\r?\n|,/).map(x => x.trim()).filter(Boolean)
      if (!f.targets.length) return ctx.reply('Lista vazia. Envie números, um por linha.')
      f.step = 'ad_text'
      f.currentAd = 0
      await ctx.reply(`Lista recebida: ${f.targets.length} contatos.\n\nEnvie o texto do Anúncio A.\n\nVariáveis: {telefone}, {data}\nVariação: {Oi|Olá|Fala}`, cancelMenu())
      return
    }

    if (f.step === 'ad_text') {
      if (text.toUpperCase() === 'FINALIZAR') return confirmCampaign(ctx, f)
      f.ads[f.currentAd] = { ...(f.ads[f.currentAd] || {}), text }
      f.step = 'ad_media'
      await ctx.reply(`Quer enviar mídia para o Anúncio ${labelFor(f.currentAd)}?\n\nEnvie foto/vídeo/documento agora ou use os botões abaixo.`, adMediaMenu())
      return
    }
  }

  if (f.type === 'groups') {
    if (f.step === 'select_groups') {
      const nums = text.split(',').map(x => Number(x.trim())).filter(n => n > 0)
      f.selectedGroups = nums.map(n => f.groups[n-1]).filter(Boolean)
      if (!f.selectedGroups.length) return ctx.reply('Nenhum grupo válido. Envie números separados por vírgula, exemplo: 1,3,8')
      f.step = 'ad_text'
      f.currentAd = 0
      await ctx.reply(`Grupos selecionados: ${f.selectedGroups.length}\n\nEnvie o texto do Anúncio A para grupos.`, cancelMenu())
      return
    }

    if (f.step === 'ad_text') {
      if (text.toUpperCase() === 'FINALIZAR') return confirmCampaign(ctx, f)
      f.ads[f.currentAd] = { ...(f.ads[f.currentAd] || {}), text }
      f.step = 'ad_media'
      await ctx.reply(`Quer enviar mídia para o Anúncio ${labelFor(f.currentAd)}?\n\nEnvie foto/vídeo/documento agora ou use os botões abaixo.`, adMediaMenu())
      return
    }
  }

  await ctx.reply('Use os botões abaixo para continuar.', cancelMenu())
})

async function downloadTelegramFile(ctx, fileId, originalName='arquivo') {
  const link = await ctx.telegram.getFileLink(fileId)
  const res = await fetch(link.href)
  const buf = Buffer.from(await res.arrayBuffer())
  const ext = path.extname(originalName) || ''
  const fileName = uid('file') + ext
  const filePath = path.join(UPLOADS, fileName)
  fs.writeFileSync(filePath, buf)
  return { filePath, fileName, mimetype: mime.lookup(originalName) || 'application/octet-stream' }
}

async function handleMedia(ctx, kind) {
  const f = flows[ctx.from.id]
  if (!f || f.step !== 'ad_media') {
    await ctx.reply('Para enviar mídia, primeiro inicie um disparo em Lista ou Grupos.', mainMenu())
    return
  }

  let fileId, fileName='arquivo'
  if (kind === 'photo') {
    const photos = ctx.message.photo
    fileId = photos[photos.length-1].file_id
    fileName = 'foto.jpg'
  } else if (kind === 'video') {
    fileId = ctx.message.video.file_id
    fileName = ctx.message.video.file_name || 'video.mp4'
  } else if (kind === 'document') {
    fileId = ctx.message.document.file_id
    fileName = ctx.message.document.file_name || 'documento'
  }

  const info = await downloadTelegramFile(ctx, fileId, fileName)
  f.ads[f.currentAd] = { ...(f.ads[f.currentAd]||{}), ...info }
  await ctx.reply(`Mídia adicionada ao Anúncio ${labelFor(f.currentAd)}.`)
  await nextAdOrConfirm(ctx, f)
}

bot.on('photo', ctx => handleMedia(ctx, 'photo'))
bot.on('video', ctx => handleMedia(ctx, 'video'))
bot.on('document', ctx => handleMedia(ctx, 'document'))

async function nextAdOrConfirm(ctx, f) {
  f.currentAd += 1
  if (f.currentAd < 3) {
    await ctx.reply(`Deseja adicionar o Anúncio ${labelFor(f.currentAd)}?`, nextAdMenu(labelFor(f.currentAd)))
  } else {
    await confirmCampaign(ctx, f)
  }
}

async function confirmCampaign(ctx, f) {
  f.ads = (f.ads || []).filter(a => a && (String(a.text || '').trim() || a.filePath))
  if (!f.ads.length) {
    f.step = 'ad_text'
    f.currentAd = 0
    return ctx.reply('Preencha pelo menos o Anúncio A.', cancelMenu())
  }
  f.step = 'confirm'
  const total = f.type === 'list' ? (f.targets || []).length : (f.selectedGroups || []).length
  if (!total) return ctx.reply('Nenhum destino encontrado. Cancele e comece novamente.', mainMenu())
  const preview = f.ads.map((a,i)=>`Anúncio ${labelFor(i)}: ${a.text ? 'texto' : ''}${a.filePath ? (a.text ? ' + mídia' : 'mídia') : ''}`).join('\n')
  await ctx.reply(`Confirmar disparo?\n\nTipo: ${f.type === 'list' ? 'Lista' : 'Grupos'}\nDestinos: ${total}\nAnúncios: ${f.ads.length}\nWhatsApp: ${waDisplay(f.session)}\n\n${preview}`, confirmMenu())
}

bot.action('confirm_send', async ctx => {
  await ctx.answerCbQuery()
  const f = flows[ctx.from.id]
  if (!f || f.step !== 'confirm') return ctx.reply('Nenhuma campanha pronta para envio.', mainMenu())

  const s = sess(f.session)
  if (!s.connected || !s.sock) return ctx.reply(`${waDisplay(f.session)} não está conectado. Conecte antes de disparar.`, mainMenu())

  await ctx.reply('Iniciando disparo...')

  let sent=0, failed=0, errors=[]
  const min = minDelay(), max = maxDelay()

  if (f.type === 'list') {
    for (let i=0;i<f.targets.length;i++) {
      const nums = normalizeBR(f.targets[i])
      if (!nums.length) { failed++; errors.push(f.targets[i]+': número inválido'); continue }
      const ad = f.ads[i % f.ads.length]
      try {
        await sendToTarget(f.session, nums[0]+'@s.whatsapp.net', ad, { telefone: nums[0], data: new Date().toLocaleDateString('pt-BR') })
        sent++
      } catch(e) { failed++; errors.push(nums[0]+': '+e.message) }
      if (i < f.targets.length-1) await sleep(min + Math.random()*(max-min))
    }
  }

  if (f.type === 'groups') {
    for (let i=0;i<f.selectedGroups.length;i++) {
      const g = f.selectedGroups[i]
      const ad = f.ads[i % f.ads.length]
      try {
        await sendToTarget(f.session, g.id, ad, { grupo: g.name, data: new Date().toLocaleDateString('pt-BR') })
        sent++
      } catch(e) { failed++; errors.push(g.name+': '+e.message) }
      if (i < f.selectedGroups.length-1) await sleep(min + Math.random()*(max-min))
    }
  }

  const finished = {
    id: uid('camp'),
    type: f.type,
    session: f.session,
    sent,
    failed,
    createdAt: new Date().toISOString()
  }
  const campaigns = read(files.campaigns, [])
  campaigns.unshift(finished)
  write(files.campaigns, campaigns)

  delete flows[ctx.from.id]
  await ctx.reply(`Disparo finalizado.\n\nEnviados: ${sent}\nFalhas: ${failed}${errors.length ? '\n\nFalhas:\n'+errors.slice(0,10).join('\n') : ''}`, mainMenu())
})

bot.action('plans', async ctx => {
  await ctx.answerCbQuery()
  const st = read(files.settings, {})
  const plans = st.plans || []
  await ctx.reply('Planos disponíveis:\n\n' + plans.map(p=>`${p.name}: R$ ${p.price} - ${p.days} dias`).join('\n') + `\n\nPIX: ${st.pixKey}\nSuporte: ${st.supportWhatsapp}`, mainMenu())
})

bot.catch(err => console.error(err))
bot.launch().then(()=>console.log(APP_NAME+' Telegram bot rodando.'))

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
