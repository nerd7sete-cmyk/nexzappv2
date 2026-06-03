const express = require('express')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')
const P = require('pino')
const mime = require('mime-types')
const XLSX = require('xlsx')
const { Boom } = require('@hapi/boom')

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} = require('@whiskeysockets/baileys')

const app = express()
const PORT = Number(process.env.PORT || 4000)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use(express.static(path.join(__dirname, 'public'), { index: false }))

const AUTH_ROOT = path.join(__dirname, 'auth')
const UPLOAD_ROOT = path.join(__dirname, 'uploads')
const DATA_ROOT = path.join(__dirname, 'data')
const ADS_FILE = path.join(DATA_ROOT, 'ads.json')
const USERS_FILE = path.join(DATA_ROOT, 'users.json')
const PLANS_FILE = path.join(DATA_ROOT, 'plans.json')
const ORDERS_FILE = path.join(DATA_ROOT, 'orders.json')
const PAYMENTS_FILE = path.join(DATA_ROOT, 'payments.json')
const SETTINGS_FILE = path.join(DATA_ROOT, 'settings.json')
const LANDING_FILE = path.join(DATA_ROOT, 'landing.json')
const RESELLERS_FILE = path.join(DATA_ROOT, 'resellers.json')
const COMMISSIONS_FILE = path.join(DATA_ROOT, 'commissions.json')
const WITHDRAWALS_FILE = path.join(DATA_ROOT, 'withdrawals.json')
const RESELLER_SETTINGS_FILE = path.join(DATA_ROOT, 'reseller-settings.json')
const MAX_TARGETS = 40
const MIN_DELAY_MS = 5000

for (const dir of [AUTH_ROOT, UPLOAD_ROOT, DATA_ROOT]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
if (!fs.existsSync(ADS_FILE)) fs.writeFileSync(ADS_FILE, '[]')
function ensureJson(file, data) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(data, null, 2))
}
ensureJson(PLANS_FILE, [
  { id: 'starter', name: 'Starter', price: 49.90, whatsappLimit: 1, sendLimit: 500, groups: false, ads: true, active: true, featured: false, description: 'Ideal para começar com uma instância.', durationDays: 30 },
  { id: 'pro', name: 'Pro', price: 97.90, whatsappLimit: 3, sendLimit: 9999, groups: true, ads: true, active: true, featured: true, description: 'Plano completo para operação comercial.', durationDays: 60 },
  { id: 'enterprise', name: 'Enterprise', price: 197.90, whatsappLimit: 10, sendLimit: 99999, groups: true, ads: true, active: true, featured: false, description: 'Para equipes e operações maiores.', durationDays: 90 }
])
ensureJson(USERS_FILE, [
  { id: 'admin', name: 'Admin Master', email: 'admin@nexzapp.local', password: 'admin123', role: 'admin', status: 'active', planId: 'enterprise', expiresAt: '2099-12-31', createdAt: new Date().toISOString() },
  { id: 'cliente-demo', name: 'Cliente Demo', email: 'cliente@nexzapp.local', password: '123456', role: 'client', status: 'active', planId: 'pro', expiresAt: '2099-12-31', createdAt: new Date().toISOString() }
])
ensureJson(ORDERS_FILE, [])
ensureJson(PAYMENTS_FILE, [])
ensureJson(SETTINGS_FILE, { pixKey: 'black7original@gmail.com', pixName: 'NEX-ZAPP', pixCity: 'SAO PAULO', supportPhone: '5599999999999', instruction: 'Após realizar o pagamento, envie o comprovante pelo WhatsApp para liberação da conta.' })
ensureJson(LANDING_FILE, { title: 'Transforme seu WhatsApp em uma central de campanhas.', subtitle: 'Conecte múltiplas instâncias, salve anúncios, gerencie listas e grupos em um painel profissional.', primaryButton: 'Comprar agora', secondaryButton: 'Entrar agora' })
ensureJson(RESELLERS_FILE, [])
ensureJson(COMMISSIONS_FILE, [])
ensureJson(WITHDRAWALS_FILE, [])
ensureJson(RESELLER_SETTINGS_FILE, { starter: 10, pro: 20, enterprise: 40, minWithdraw: 50 })

function normalizeV16Defaults() {
  const defaultSettings = {
    pixKey: 'black7original@gmail.com',
    pixName: 'NEX-ZAPP',
    pixCity: 'SAO PAULO',
    supportPhone: '5599999999999',
    instruction: 'Após o pagamento envie o comprovante para liberação da conta.'
  }
  const defaultLanding = {
    title: 'Transforme seu WhatsApp em uma central de campanhas',
    subtitle: 'Conecte múltiplas instâncias, gerencie grupos, listas e campanhas em um único painel.',
    primaryButton: 'Comprar Agora',
    secondaryButton: 'Entrar Agora'
  }
  const settings = { ...defaultSettings, ...Object.fromEntries(Object.entries(readJson(SETTINGS_FILE, {})).filter(([k,v]) => v !== '' && v != null)) }
  const landing = { ...defaultLanding, ...Object.fromEntries(Object.entries(readJson(LANDING_FILE, {})).filter(([k,v]) => v !== '' && v != null)) }
  writeJson(SETTINGS_FILE, settings)
  writeJson(LANDING_FILE, landing)
}
normalizeV16Defaults()

function normalizeDataFiles() {
  const defaultSettings = {
    pixKey: 'black7original@gmail.com',
    pixName: 'NEX-ZAPP',
    pixCity: 'SAO PAULO',
    supportPhone: '5599999999999',
    instruction: 'Após realizar o pagamento, envie o comprovante pelo WhatsApp para liberação da conta.'
  }
  const defaultLanding = {
    title: 'Transforme seu WhatsApp em uma central de campanhas.',
    subtitle: 'Conecte múltiplas instâncias, salve anúncios, gerencie listas e grupos em um painel profissional.',
    primaryButton: 'Comprar agora',
    secondaryButton: 'Entrar agora'
  }
  const settings = { ...defaultSettings, ...readJson(SETTINGS_FILE, {}) }
  const landing = { ...defaultLanding, ...readJson(LANDING_FILE, {}) }
  writeJson(SETTINGS_FILE, settings)
  writeJson(LANDING_FILE, landing)

  const plans = readJson(PLANS_FILE, [])
  if (!Array.isArray(plans) || !plans.length) {
    writeJson(PLANS_FILE, [
      { id: 'starter', name: 'Starter', price: 49.90, whatsappLimit: 1, sendLimit: 500, groups: false, ads: true, active: true, featured: false, description: 'Ideal para começar com uma instância.', durationDays: 30 },
      { id: 'pro', name: 'Pro', price: 97.90, whatsappLimit: 3, sendLimit: 9999, groups: true, ads: true, active: true, featured: true, description: 'Plano completo para operação comercial.', durationDays: 60 },
      { id: 'enterprise', name: 'Enterprise', price: 197.90, whatsappLimit: 10, sendLimit: 99999, groups: true, ads: true, active: true, featured: false, description: 'Para equipes e operações maiores.', durationDays: 90 }
    ])
  }

  const users = readJson(USERS_FILE, [])
  if (!Array.isArray(users) || !users.some(u => u.role === 'admin')) {
    writeJson(USERS_FILE, [
      { id: 'admin', name: 'Admin Master', email: 'admin@nexzapp.local', password: 'admin123', role: 'admin', status: 'active', planId: 'enterprise', expiresAt: '2099-12-31', createdAt: new Date().toISOString() }
    ])
  }
}
normalizeDataFiles()


function readJson(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}
function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function isExpired(date) {
  return !!date && String(date).slice(0, 10) < todayISO()
}
function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function cleanPhone(raw) {
  return String(raw || '').replace(/\D/g, '')
}
function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim())
}
function validName(name) {
  const n = String(name || '').trim()
  const letters = (n.match(/[a-zA-ZÀ-ÿ]/g) || []).length
  if (n.length < 3) return false
  if (letters < 2) return false
  if (/^\d+$/.test(n)) return false
  if (/^(teste|aaaa|qwe|qwer|asdf)$/i.test(n)) return false
  return true
}
function validateLeadData({ name, email, phone }) {
  const clean = cleanPhone(phone)
  if (!validName(name)) return { ok: false, error: 'Informe um nome válido.' }
  if (!validEmail(email)) return { ok: false, error: 'Informe um e-mail válido.' }
  if (clean.length < 10 || clean.length > 15) return { ok: false, error: 'Informe um WhatsApp válido com DDD.' }
  return { ok: true, phone: clean }
}


function resellerCode(name) {
  const base = String(name || 'revenda').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'REV'
  return base + Math.floor(100 + Math.random() * 900)
}
function publicReseller(r) {
  if (!r) return null
  const { password, ...safe } = r
  return safe
}
function findResellerByToken(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const email = authTokens[token]
  if (!email) return null
  return readJson(RESELLERS_FILE, []).find(r => String(r.email).toLowerCase() === String(email).toLowerCase()) || null
}
function requireReseller(req, res, next) {
  const reseller = findResellerByToken(req)
  if (!reseller) return res.status(401).json({ success:false, error:'Login de revendedor necessário.' })
  req.reseller = reseller
  next()
}
function commissionForPlan(planId, saleValue = 0) {
  const settings = readJson(RESELLER_SETTINGS_FILE, { type:'percent', starter:10, pro:20, enterprise:40, minWithdraw:50 })
  const raw = Number(settings[String(planId || '').toLowerCase()] ?? 20)
  if (settings.type === 'fixed') return raw
  return Number((Number(saleValue || 0) * raw / 100).toFixed(2))
}

const authTokens = {}

function publicUser(u) {
  if (!u) return null
  const { password, ...safe } = u
  return safe
}
function findUserByToken(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const email = authTokens[token]
  if (!email) return null
  return readJson(USERS_FILE, []).find(u => String(u.email).toLowerCase() === String(email).toLowerCase()) || null
}
function requireLogin(req, res, next) {
  const user = findUserByToken(req)
  if (!user) return res.status(401).json({ success: false, error: 'Login necessário.' })
  req.user = user
  next()
}
function requireAdmin(req, res, next) {
  const user = findUserByToken(req)
  if (!user || user.role !== 'admin') return res.status(403).json({ success: false, error: 'Acesso admin necessário.' })
  req.user = user
  next()
}
function requireActiveClient(req, res, next) {
  const user = findUserByToken(req)
  if (!user) return res.status(401).json({ success: false, error: 'Login necessário.' })
  if (user.role !== 'admin' && (user.status !== 'active' || isExpired(user.expiresAt))) {
    return res.status(402).json({ success: false, error: 'Assinatura vencida ou bloqueada.' })
  }
  req.user = user
  next()
}
function planById(id) {
  return readJson(PLANS_FILE, []).find(p => p.id === id) || null
}

const storage = multer.diskStorage({
  destination: UPLOAD_ROOT,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '') || `.${mime.extension(file.mimetype) || 'bin'}`
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext.toLowerCase()}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 160 * 1024 * 1024, files: 4 }
})

const sessions = {}

function safeName(name) {
  const v = String(name || 'whatsapp1').trim().replace(/[^a-zA-Z0-9_-]/g, '')
  return v || 'whatsapp1'
}

function displayName(name) {
  const map = {
    whatsapp1: 'WhatsApp 01',
    whatsapp2: 'WhatsApp 02',
    whatsapp3: 'WhatsApp 03'
  }
  return map[name] || name
}

function makeSession(name) {
  name = safeName(name)
  if (!sessions[name]) {
    sessions[name] = {
      name,
      label: displayName(name),
      sock: null,
      qr: null,
      connected: false,
      starting: false,
      stage: 'offline',
      lastSeen: null,
      sentToday: 0,
      logs: []
    }
  }
  return sessions[name]
}

function log(name, msg) {
  const s = makeSession(name)
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`
  s.logs.unshift(line)
  s.logs = s.logs.slice(0, 80)
  console.log(`[${displayName(name)}] ${msg}`)
}

function sessionPath(name) {
  return path.join(AUTH_ROOT, safeName(name))
}

function resetStateOnly(name) {
  const s = makeSession(name)
  s.sock = null
  s.qr = null
  s.connected = false
  s.starting = false
  s.stage = 'offline'
}

async function connectWhatsApp(name) {
  name = safeName(name)
  const s = makeSession(name)

  if (s.starting) {
    log(name, 'Conexão já está em andamento. Aguarde.')
    return
  }

  if (s.connected) {
    log(name, 'Conta já conectada.')
    return
  }

  s.starting = true
  s.qr = null
  s.stage = 'starting'
  log(name, 'Iniciando conexão...')

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath(name))
  const { version } = await fetchLatestBaileysVersion()

  log(name, 'Preparando canal seguro...')

  const sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '22.04'],
    syncFullHistory: false,
    markOnlineOnConnect: false, // mantém a instância sem marcar presença online automaticamente
    generateHighQualityLinkPreview: false
  })

  s.sock = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update

    if (qr) {
      s.qr = await QRCode.toDataURL(qr)
      s.starting = false
      s.connected = false
      s.stage = 'qr'
      log(name, 'QR Code gerado. Aguardando leitura.')
    }

    if (connection === 'connecting') {
      s.stage = s.qr ? 'qr' : 'starting'
    }

    if (connection === 'open') {
      s.connected = true
      s.starting = false
      s.qr = null
      s.stage = 'connected'
      s.lastSeen = new Date().toLocaleString()
      log(name, 'Conta conectada com sucesso.')
    }

    if (connection === 'close') {
      s.connected = false
      s.starting = false

      const error = lastDisconnect?.error
      const code = error instanceof Boom ? error.output.statusCode : error?.output?.statusCode
      log(name, 'Conexão encerrada. Código: ' + (code || 'sem código'))

      if (code === 515) {
        s.stage = 'syncing'
        log(name, 'Sincronizando sessão. Reiniciando conexão...')
        resetStateOnly(name)
        setTimeout(() => connectWhatsApp(name).catch(err => log(name, 'Falha ao reiniciar: ' + err.message)), 1500)
        return
      }

      if (code === DisconnectReason.loggedOut || code === 401 || code === 405) {
        try { fs.rmSync(sessionPath(name), { recursive: true, force: true }) } catch {}
        resetStateOnly(name)
        s.stage = 'error'
        log(name, 'Sessão removida. Gere um novo QR Code.')
        return
      }

      s.stage = 'offline'
    }
  })
}

function readAds() {
  try { return JSON.parse(fs.readFileSync(ADS_FILE, 'utf8')) } catch { return [] }
}

function writeAds(ads) {
  fs.writeFileSync(ADS_FILE, JSON.stringify(ads, null, 2))
}

function publicAd(ad) {
  return {
    id: ad.id,
    name: ad.name,
    message: ad.message,
    note: ad.note || '',
    mediaUrl: ad.mediaPath ? `/uploads/${path.basename(ad.mediaPath)}` : null,
    mediaName: ad.mediaName || '',
    mimetype: ad.mimetype || '',
    createdAt: ad.createdAt
  }
}

function cleanFiles(files) {
  for (const file of files || []) {
    try { if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path) } catch {}
  }
}

function mediaPayload(file, message) {
  if (!file) return { text: message }
  const mimetype = file.mimetype || mime.lookup(file.originalname || file.mediaName || '') || 'application/octet-stream'
  const filePath = file.path || file.mediaPath

  if (mimetype.startsWith('image/')) return { image: { url: filePath }, caption: message, mimetype }
  if (mimetype.startsWith('video/')) return { video: { url: filePath }, caption: message, mimetype }

  return {
    document: { url: filePath },
    fileName: file.originalname || file.mediaName || 'arquivo',
    mimetype,
    caption: message
  }
}


function parseLines(text) {
  return String(text || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean).slice(0, MAX_TARGETS)
}

function parseTargetLine(line) {
  const parts = String(line || '').split(/[;,]/).map(p => p.trim()).filter(Boolean)
  const target = parts.shift() || ''
  const vars = {}
  for (const part of parts) {
    const [k, ...rest] = part.split('=')
    if (k && rest.length) vars[k.trim()] = rest.join('=').trim()
  }
  return { target, vars }
}

function normalizeBrazilCandidates(raw) {
  let n = String(raw || '').replace(/\D/g, '')
  if (!n) return []
  if (n.startsWith('00')) n = n.slice(2)
  const candidates = new Set()

  const add = (v) => {
    v = String(v || '').replace(/\D/g, '')
    if (v.length >= 10 && v.length <= 15) candidates.add(v)
  }

  add(n)

  // If user pasted local BR number without country code.
  if (!n.startsWith('55') && (n.length === 10 || n.length === 11)) add('55' + n)

  // If BR number has DDD + 8 digits, add 9 after DDD.
  if (!n.startsWith('55') && n.length === 10) add('55' + n.slice(0, 2) + '9' + n.slice(2))

  // If BR number has 55 + DDD + 8 digits, add 9 after DDD.
  if (n.startsWith('55') && n.length === 12) add('55' + n.slice(2, 4) + '9' + n.slice(4))

  // If user pasted 55 + DDD + 9 digits, also try without 9 as fallback.
  if (n.startsWith('55') && n.length === 13 && n[4] === '9') add('55' + n.slice(2, 4) + n.slice(5))

  return [...candidates]
}

async function findWhatsAppJid(sock, raw) {
  const candidates = normalizeBrazilCandidates(raw)
  for (const number of candidates) {
    try {
      const check = await sock.onWhatsApp(number)
      if (check && check.length) return { jid: check[0].jid, number, candidates }
    } catch {}
  }
  return { jid: null, number: candidates[0] || String(raw || '').replace(/\D/g, ''), candidates }
}

function rowToTargetLine(row) {
  const obj = {}
  for (const [k, v] of Object.entries(row || {})) obj[String(k).trim().toLowerCase()] = v
  const phoneKey = ['whatsapp','telefone','celular','numero','número','phone','number','contato'].find(k => obj[k] != null && String(obj[k]).trim())
  const rawNumber = phoneKey ? obj[phoneKey] : Object.values(row || {})[0]
  const number = String(rawNumber || '').replace(/\D/g, '')
  if (!number) return ''
  const vars = []
  for (const [k, v] of Object.entries(row || {})) {
    const key = String(k || '').trim()
    const val = String(v ?? '').trim()
    if (!key || !val) continue
    if (phoneKey && key.toLowerCase() === phoneKey) continue
    vars.push(`${key}=${val}`)
  }
  return [number, ...vars].join(';')
}

function parseContactFile(file) {
  if (!file || !file.path) return []
  const ext = String(file.originalname || file.filename || '').toLowerCase()
  try {
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      const wb = XLSX.readFile(file.path)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      return rows.map(rowToTargetLine).filter(Boolean)
    }

    const txt = fs.readFileSync(file.path, 'utf8')
    if (ext.endsWith('.csv')) {
      const lines = txt.split(/\r?\n/).filter(Boolean)
      if (!lines.length) return []
      const sep = lines[0].includes(';') ? ';' : ','
      const headers = lines[0].split(sep).map(h => h.trim())
      return lines.slice(1).map(line => {
        const vals = line.split(sep).map(v => v.trim())
        const row = {}
        headers.forEach((h, i) => row[h || `coluna${i+1}`] = vals[i] || '')
        return rowToTargetLine(row)
      }).filter(Boolean)
    }

    return parseLines(txt)
  } catch (err) {
    return []
  }
}

function mergeTargets(text, file) {
  const fromText = parseLines(text)
  const fromFile = parseContactFile(file)
  return [...fromText, ...fromFile].filter(Boolean).slice(0, MAX_TARGETS)
}

function applyVars(msg, vars) {
  return String(msg || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => vars[key] ?? '')
}

function safeDelay(min, max) {
  min = Math.max(Number(min || MIN_DELAY_MS), MIN_DELAY_MS)
  max = Math.max(Number(max || min), min)
  return min + Math.floor(Math.random() * (max - min + 1))
}

function parseSelectedSessions(raw) {
  try {
    const arr = JSON.parse(raw || '[]')
    return arr.map(safeName).filter(Boolean)
  } catch {
    return String(raw || '').split(',').map(safeName).filter(Boolean)
  }
}

function connectedSessions(names) {
  return names.map(name => makeSession(name)).filter(s => s.connected && s.sock)
}

function shuffleCopy(arr) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickRandomBalanced(pool, index) {
  if (!pool.length) return null
  const shuffled = shuffleCopy(pool)
  return shuffled[index % shuffled.length]
}

function manualAdsFromRequest(req) {
  return [
    { name: 'Comunicação A', msg: req.body.msg1 || '', file: req.files?.media1?.[0] },
    { name: 'Comunicação B', msg: req.body.msg2 || '', file: req.files?.media2?.[0] },
    { name: 'Comunicação C', msg: req.body.msg3 || '', file: req.files?.media3?.[0] }
  ].filter(ad => ad.msg || ad.file)
}

function savedAdsFromRequest(req) {
  let ids = []
  try { ids = JSON.parse(req.body.selectedAds || '[]') } catch {}
  const all = readAds()
  return ids.map(id => all.find(ad => ad.id === id)).filter(Boolean).map(ad => ({
    name: ad.name,
    msg: ad.message,
    file: ad.mediaPath ? {
      path: ad.mediaPath,
      mediaPath: ad.mediaPath,
      mediaName: ad.mediaName,
      mimetype: ad.mimetype
    } : null
  }))
}

function adsForRequest(req) {
  const mode = req.body.adMode || 'manual'
  if (mode === 'saved') return savedAdsFromRequest(req)
  return manualAdsFromRequest(req)
}


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')))
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')))
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')))
app.get('/revenda', (req, res) => res.sendFile(path.join(__dirname, 'public', 'revenda.html')))

app.get('/api/public/plans', (req, res) => res.json({ success: true, plans: readJson(PLANS_FILE, []).filter(p => p.active) }))
app.get('/api/public/landing', (req, res) => res.json({ success: true, landing: readJson(LANDING_FILE, {}), settings: readJson(SETTINGS_FILE, {}) }))

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {}
  const users = readJson(USERS_FILE, [])
  const user = users.find(u => String(u.email).toLowerCase() === String(email || '').toLowerCase() && String(u.password) === String(password || ''))
  if (!user) return res.json({ success: false, error: 'E-mail ou senha incorretos.' })
  const token = uid('token')
  authTokens[token] = user.email
  res.json({ success: true, token, user: publicUser(user), role: user.role })
})

app.get('/api/me', requireLogin, (req, res) => {
  res.json({ success: true, user: publicUser(req.user), plan: planById(req.user.planId), expired: isExpired(req.user.expiresAt) })
})

app.post('/api/order', (req, res) => {
  const plans = readJson(PLANS_FILE, [])
  const requestedPlan = String(req.body.planId || req.body.plan || 'pro').trim().toLowerCase()
  const plan = plans.find(p => String(p.id).toLowerCase() === requestedPlan) || plans.find(p => String(p.id).toLowerCase() === 'pro') || plans[0]

  if (!plan) return res.json({ success:false, error:'Nenhum plano configurado no admin.' })

  const validation = validateLeadData(req.body || {})
  if (!validation.ok) return res.json({ success:false, error: validation.error })

  const durationDays = Number(plan.durationDays || plan.validityDays || plan.days || plan.duration || 30)

  const settings = readJson(SETTINGS_FILE, {
    pixKey: 'black7original@gmail.com',
    pixName: 'NEX-ZAPP',
    pixCity: 'SAO PAULO',
    supportPhone: '5599999999999',
    receiptWhatsapp: '5599999999999',
    instruction: 'Envie o comprovante pelo WhatsApp para liberação mais rápida. Caso não envie, aguarde até 30 minutos após a confirmação do pagamento.'
  })
  settings.supportPhone = String(settings.supportPhone || '').replace(/\D/g, '')
  settings.receiptWhatsapp = String(settings.receiptWhatsapp || settings.supportPhone || '').replace(/\D/g, '')

  const order = {
    id: uid('order'),
    name: String(req.body.name || '').trim(),
    payerName: String(req.body.payerName || req.body.name || '').trim(),
    password: String(req.body.password || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
    phone: validation.phone,
    planId: plan.id,
    planName: plan.name,
    value: Number(plan.price || plan.value || 0),
    durationDays,
    status: 'pending',
    refCode: String(req.body.ref || req.body.refCode || '').trim().toUpperCase(),
    createdAt: new Date().toISOString()
  }

  const orders = readJson(ORDERS_FILE, [])
  orders.unshift(order)
  writeJson(ORDERS_FILE, orders)

  res.json({ success:true, order, settings })
})

app.get('/api/billing', requireLogin, (req, res) => {
  res.json({ success: true, user: publicUser(req.user), plan: planById(req.user.planId), plans: readJson(PLANS_FILE, []).filter(p => p.active !== false), settings: readJson(SETTINGS_FILE, {}), payments: readJson(PAYMENTS_FILE, []).filter(p => p.userEmail === req.user.email) })
})

app.post('/api/billing/request', requireLogin, (req, res) => {
  const requestedPlanId = String(req.body.planId || req.user.planId || '').trim()
  const plan = planById(requestedPlanId)
  if (!plan || plan.active === false) return res.json({ success: false, error: 'Plano inválido para renovação.' })
  const orders = readJson(ORDERS_FILE, [])
  const order = { id: uid('renew'), name: req.user.name, email: req.user.email, phone: req.user.phone || '', planId: plan.id, planName: plan.name, value: plan.price || 0, durationDays: durationDays(plan), status: 'pending', type: 'renewal', createdAt: new Date().toISOString() }
  orders.unshift(order)
  writeJson(ORDERS_FILE, orders)
  res.json({ success: true, order, settings: readJson(SETTINGS_FILE, {}) })
})

app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const users = readJson(USERS_FILE, [])
  const orders = readJson(ORDERS_FILE, [])
  const payments = readJson(PAYMENTS_FILE, [])
  const clients = users.filter(u => u.role === 'client')
  const paid = payments.filter(p => p.status === 'paid')
  const month = new Date().toISOString().slice(0, 7)
  res.json({
    success: true,
    summary: {
      clientsActive: clients.filter(u => u.status === 'active' && !isExpired(u.expiresAt)).length,
      clientsExpired: clients.filter(u => u.status !== 'active' || isExpired(u.expiresAt)).length,
      ordersPending: orders.filter(o => o.status === 'pending').length,
      paymentsPaid: paid.length,
      monthRevenue: paid.filter(p => String(p.paidAt || p.createdAt || '').startsWith(month)).reduce((a, p) => a + Number(p.value || 0), 0),
      totalRevenue: paid.reduce((a, p) => a + Number(p.value || 0), 0)
    }
  })
})
app.get('/api/admin/all', requireAdmin, (req, res) => {
  const settingsDefault = {
    pixKey: 'black7original@gmail.com',
    pixName: 'NEX-ZAPP',
    pixCity: 'SAO PAULO',
    supportPhone: '5599999999999',
    receiptWhatsapp: '5599999999999',
    instruction: 'Envie o comprovante pelo WhatsApp para liberação mais rápida. Caso não envie, aguarde até 30 minutos após a confirmação do pagamento.'
  }
  const settings = { ...settingsDefault, ...readJson(SETTINGS_FILE, {}) }
  settings.supportPhone = String(settings.supportPhone || '').replace(/\D/g, '')
  settings.receiptWhatsapp = String(settings.receiptWhatsapp || settings.supportPhone || '').replace(/\D/g, '')
  res.json({ success: true, users: readJson(USERS_FILE, []), plans: readJson(PLANS_FILE, []), orders: readJson(ORDERS_FILE, []), payments: readJson(PAYMENTS_FILE, []), settings, landing: readJson(LANDING_FILE, {}) })
})

app.get('/api/admin/safe-bootstrap', requireAdmin, (req, res) => {
  const settingsDefault = {
    pixKey: 'black7original@gmail.com',
    pixName: 'NEX-ZAPP',
    pixCity: 'SAO PAULO',
    supportPhone: '5599999999999',
    instruction: 'Após o pagamento envie o comprovante para liberação da conta.'
  }
  const landingDefault = {
    title: 'Transforme seu WhatsApp em uma central de campanhas',
    subtitle: 'Conecte múltiplas instâncias, gerencie grupos, listas e campanhas em um único painel.',
    primaryButton: 'Comprar Agora',
    secondaryButton: 'Entrar Agora'
  }
  const users = readJson(USERS_FILE, [])
  const plans = readJson(PLANS_FILE, [])
  const orders = readJson(ORDERS_FILE, [])
  const payments = readJson(PAYMENTS_FILE, [])
  const settings = { ...settingsDefault, ...readJson(SETTINGS_FILE, {}) }
  const landing = { ...landingDefault, ...readJson(LANDING_FILE, {}) }
  res.json({ success:true, users, plans, orders, payments, settings, landing })
})

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const users = readJson(USERS_FILE, [])
  const email = String(req.body.email || '').trim().toLowerCase()
  const validation = validateLeadData({ name: req.body.name, email, phone: req.body.phone })
  if (!validation.ok) return res.json({ success: false, error: validation.error })
  if (users.some(u => String(u.email).toLowerCase() === email)) return res.json({ success: false, error: 'E-mail já cadastrado.' })
  const user = {
    id: uid('user'), role: 'client',
    name: String(req.body.name || '').trim(),
    email,
    phone: validation.phone,
    password: req.body.password || '123456',
    planId: req.body.planId || 'pro',
    status: req.body.status || 'active',
    expiresAt: req.body.expiresAt || planEndDate(req.body.planId || 'pro'),
    createdAt: new Date().toISOString()
  }
  users.unshift(user)
  writeJson(USERS_FILE, users)
  res.json({ success: true, user: publicUser(user) })
})
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
  const users = readJson(USERS_FILE, [])
  const idx = users.findIndex(u => u.id === req.params.id)
  if (idx < 0) return res.json({ success: false, error: 'Cliente não encontrado.' })
  users[idx] = { ...users[idx], ...req.body, id: users[idx].id, role: users[idx].role }
  writeJson(USERS_FILE, users)
  res.json({ success: true, user: publicUser(users[idx]) })
})
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  writeJson(USERS_FILE, readJson(USERS_FILE, []).filter(u => u.id !== req.params.id))
  res.json({ success: true })
})
app.post('/api/admin/users/:id/renew', requireAdmin, (req, res) => {
  const users = readJson(USERS_FILE, [])
  const idx = users.findIndex(u => u.id === req.params.id)
  if (idx < 0) return res.json({ success: false, error: 'Cliente não encontrado.' })
  const requestedPlanId = req.body.planId || users[idx].planId
  const plan = planById(requestedPlanId) || planById(users[idx].planId)
  const days = Number(req.body.days || durationDays(plan))
  users[idx].status = 'active'
  if (plan?.id) users[idx].planId = plan.id
  users[idx].expiresAt = addDays(days)
  writeJson(USERS_FILE, users)
  const payments = readJson(PAYMENTS_FILE, [])
  const payment = { id: uid('pay'), userId: users[idx].id, userEmail: users[idx].email, name: users[idx].name, planId: users[idx].planId, planName: plan?.name || '-', value: Number(req.body.value ?? plan?.price ?? 0), status: 'paid', createdAt: new Date().toISOString(), paidAt: new Date().toISOString() }
  payments.unshift(payment)
  writeJson(PAYMENTS_FILE, payments)
  res.json({ success: true, user: publicUser(users[idx]), payment })
})
app.put('/api/admin/plans/:id', requireAdmin, (req, res) => {
  const plans = readJson(PLANS_FILE, [])
  const idx = plans.findIndex(p => p.id === req.params.id)
  if (idx < 0) return res.json({ success: false, error: 'Plano não encontrado.' })
  plans[idx] = { ...plans[idx], ...req.body, id: plans[idx].id }
  writeJson(PLANS_FILE, plans)
  res.json({ success: true, plan: plans[idx] })
})
app.post('/api/admin/plans', requireAdmin, (req, res) => {
  const plans = readJson(PLANS_FILE, [])
  const plan = { id: uid('plan'), name: req.body.name || 'Novo plano', price: Number(req.body.price || 0), whatsappLimit: Number(req.body.whatsappLimit || 1), sendLimit: Number(req.body.sendLimit || 500), durationDays: Number(req.body.durationDays || 30), groups: !!req.body.groups, ads: true, active: true, featured: false, description: req.body.description || '' }
  plans.push(plan)
  writeJson(PLANS_FILE, plans)
  res.json({ success: true, plan })
})

function getOrderRefCode(order) {
  return String(order?.refCode || order?.ref || order?.resellerCode || '').trim().toUpperCase()
}

function getPlanKeyForCommission(order) {
  return String(order?.planId || order?.planName || 'pro').trim().toLowerCase()
}

function calculateCommissionValue(order) {
  const settings = readJson(RESELLER_SETTINGS_FILE, { type:'percent', starter:10, pro:20, enterprise:40, minWithdraw:50 })
  const planKey = getPlanKeyForCommission(order)
  const raw = Number(settings[planKey] ?? settings.pro ?? 20)
  const saleValue = Number(order?.value || 0)
  if (settings.type === 'fixed') return Number(raw.toFixed ? raw.toFixed(2) : raw)
  return Number((saleValue * raw / 100).toFixed(2))
}

function createCommissionForOrder(order) {
  const refCode = getOrderRefCode(order)
  if (!refCode) return null

  const resellers = readJson(RESELLERS_FILE, [])
  const reseller = resellers.find(r => String(r.code || '').trim().toUpperCase() === refCode)
  if (!reseller) return null
  if (String(reseller.status || '').toLowerCase() === 'blocked') return null

  const commissions = readJson(COMMISSIONS_FILE, [])
  const already = commissions.find(c => String(c.orderId) === String(order.id))
  if (already) return already

  const commission = {
    id: uid('comm'),
    orderId: order.id,
    resellerId: reseller.id,
    resellerName: reseller.name,
    resellerEmail: reseller.email,
    resellerCode: reseller.code,
    clientName: order.name,
    clientEmail: order.email,
    planId: order.planId,
    planName: order.planName,
    saleValue: Number(order.value || 0),
    value: calculateCommissionValue(order),
    status: 'available',
    createdAt: new Date().toISOString()
  }

  commissions.unshift(commission)
  writeJson(COMMISSIONS_FILE, commissions)
  return commission
}


app.post('/api/admin/orders/:id/approve', requireAdmin, (req, res) => {
  const orders = readJson(ORDERS_FILE, [])
  const idx = orders.findIndex(o => String(o.id) === String(req.params.id))
  if (idx < 0) return res.json({ success:false, error:'Pedido não encontrado.' })

  const order = orders[idx]
  const users = readJson(USERS_FILE, [])
  const plans = readJson(PLANS_FILE, [])
  const plan = plans.find(p => String(p.id).toLowerCase() === String(order.planId).toLowerCase()) || plans.find(p => String(p.id).toLowerCase() === 'pro') || plans[0]
  const durationDays = Number(order.durationDays || plan?.durationDays || plan?.validityDays || plan?.days || 30)
  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString().slice(0,10)

  let user = users.find(u => String(u.email).toLowerCase() === String(order.email).toLowerCase())
  if (!user) {
    user = {
      id: uid('user'),
      name: order.name,
      email: order.email,
      phone: order.phone,
      password: String(req.body?.password || order.password || '123456'),
      planId: order.planId,
      planName: order.planName,
      expiresAt,
      status: 'active',
      createdAt: new Date().toISOString()
    }
    users.unshift(user)
  } else {
    user.name = order.name || user.name
    user.phone = order.phone || user.phone
    user.planId = order.planId
    user.planName = order.planName
    user.expiresAt = expiresAt
    user.status = 'active'
  }

  order.status = 'approved'
  order.approvedAt = new Date().toISOString()
  order.userId = user.id
  orders[idx] = order

  writeJson(USERS_FILE, users)
  writeJson(ORDERS_FILE, orders)

  const payments = readJson(PAYMENTS_FILE, [])
  const already = payments.find(p => p.orderId === order.id)
  if (!already) {
    payments.unshift({
      id: uid('pay'),
      orderId: order.id,
      userId: user.id,
      userEmail: user.email,
      name: user.name,
      planId: order.planId,
      planName: order.planName,
      value: Number(order.value || 0),
      status: 'paid',
      paidAt: new Date().toISOString()
    })
    writeJson(PAYMENTS_FILE, payments)
  }

  try { createCommissionForOrder(order) } catch(e) { console.warn('commission error', e.message) }

  res.json({ success:true, order, user })
})
app.post('/api/admin/orders/:id/cancel', requireAdmin, (req, res) => {
  const orders = readJson(ORDERS_FILE, [])
  const idx = orders.findIndex(o => o.id === req.params.id)
  if (idx >= 0) orders[idx].status = 'canceled'
  writeJson(ORDERS_FILE, orders)
  res.json({ success: true })
})
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const defaults = {
    pixKey: 'black7original@gmail.com',
    pixName: 'NEX-ZAPP',
    pixCity: 'SAO PAULO',
    supportPhone: '5599999999999',
    receiptWhatsapp: '5599999999999',
    instruction: 'Envie o comprovante pelo WhatsApp para liberação mais rápida. Caso não envie, aguarde até 30 minutos após a confirmação do pagamento.'
  }
  const cur = readJson(SETTINGS_FILE, {})
  const support = String(req.body.supportPhone || cur.supportPhone || defaults.supportPhone).replace(/\D/g, '')
  const receipt = String(req.body.receiptWhatsapp || cur.receiptWhatsapp || support || defaults.receiptWhatsapp).replace(/\D/g, '')
  const settings = {
    pixKey: String(req.body.pixKey || cur.pixKey || defaults.pixKey).trim(),
    pixName: String(req.body.pixName || cur.pixName || defaults.pixName).trim(),
    pixCity: String(req.body.pixCity || cur.pixCity || defaults.pixCity).trim(),
    supportPhone: support,
    receiptWhatsapp: receipt,
    instruction: String(req.body.instruction || cur.instruction || defaults.instruction).trim()
  }
  writeJson(SETTINGS_FILE, settings)
  res.json({ success: true, settings })
})
app.put('/api/admin/landing', requireAdmin, (req, res) => {
  const defaults = {
    title: 'Transforme seu WhatsApp em uma central de campanhas',
    subtitle: 'Conecte múltiplas instâncias, gerencie grupos, listas e campanhas em um único painel.',
    primaryButton: 'Comprar Agora',
    secondaryButton: 'Entrar Agora'
  }
  const cur = readJson(LANDING_FILE, {})
  const landing = {
    title: String(req.body.title || cur.title || defaults.title).trim(),
    subtitle: String(req.body.subtitle || cur.subtitle || defaults.subtitle).trim(),
    primaryButton: String(req.body.primaryButton || cur.primaryButton || defaults.primaryButton).trim(),
    secondaryButton: String(req.body.secondaryButton || cur.secondaryButton || defaults.secondaryButton).trim()
  }
  writeJson(LANDING_FILE, landing)
  res.json({ success: true, landing })
})


/* ===== REVENDA / AFILIADOS ===== */
app.post('/api/reseller/apply', (req, res) => {
  const name = String(req.body.name || '').trim()
  const email = String(req.body.email || '').trim().toLowerCase()
  const phone = String(req.body.phone || '').replace(/\D/g, '')
  const city = String(req.body.city || '').trim()
  const pixKey = String(req.body.pixKey || '').trim()
  const password = String(req.body.password || '').trim()
  if (!name || name.length < 3) return res.json({ success:false, error:'Informe seu nome.' })
  if (!validEmail(email)) return res.json({ success:false, error:'Informe um e-mail válido.' })
  if (phone.length < 10 || phone.length > 15) return res.json({ success:false, error:'Informe um WhatsApp válido.' })
  if (!pixKey) return res.json({ success:false, error:'Informe sua chave PIX.' })
  if (password.length < 6) return res.json({ success:false, error:'Crie uma senha com pelo menos 6 caracteres.' })

  const list = readJson(RESELLERS_FILE, [])
  let found = list.find(r => String(r.email).toLowerCase() === email)
  if (found) return res.json({ success:true, reseller: publicReseller(found), message:'Sua solicitação já está cadastrada.' })

  const reseller = {
    id: uid('reseller'),
    name, email, phone, city, pixKey, password,
    code: resellerCode(name),
    status: 'pending',
    createdAt: new Date().toISOString()
  }
  list.unshift(reseller)
  writeJson(RESELLERS_FILE, list)
  res.json({ success:true, reseller: publicReseller(reseller), message:'Solicitação enviada. Aguarde aprovação do administrador.' })
})

app.post('/api/reseller/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '').trim()
  const list = readJson(RESELLERS_FILE, [])
  const reseller = list.find(r => String(r.email).toLowerCase() === email && String(r.password || '123456') === password)
  if (!reseller) return res.json({ success:false, error:'E-mail ou senha incorretos.' })
  if (reseller.status !== 'approved') return res.json({ success:false, error:'Seu cadastro de revendedor ainda não foi aprovado.' })
  const token = uid('reseller-token')
  authTokens[token] = reseller.email
  res.json({ success:true, token, reseller: publicReseller(reseller) })
})

app.get('/api/reseller/me', requireReseller, (req, res) => {
  const commissions = readJson(COMMISSIONS_FILE, []).filter(c => c.resellerId === req.reseller.id)
  const withdrawals = readJson(WITHDRAWALS_FILE, []).filter(w => w.resellerId === req.reseller.id)
  const referrals = commissions
  const total = commissions.reduce((a,c)=>a+Number(c.value||0),0)
  const paid = withdrawals.filter(w=>w.status==='paid').reduce((a,w)=>a+Number(w.value||0),0)
  const pendingWithdraw = withdrawals.filter(w=>w.status==='pending').reduce((a,w)=>a+Number(w.value||0),0)
  const available = Math.max(0, total - paid - pendingWithdraw)
  res.json({ success:true, reseller: publicReseller(req.reseller), commissions, withdrawals, referrals, summary:{ total, paid, pendingWithdraw, available, clients: referrals.length } })
})

app.post('/api/reseller/withdraw', requireReseller, (req, res) => {
  const value = Number(req.body.value || 0)
  const pixKey = String(req.body.pixKey || req.reseller.pixKey || '').trim()
  const commissions = readJson(COMMISSIONS_FILE, []).filter(c => c.resellerId === req.reseller.id)
  const withdrawals = readJson(WITHDRAWALS_FILE, []).filter(w => w.resellerId === req.reseller.id)
  const total = commissions.reduce((a,c)=>a+Number(c.value||0),0)
  const paid = withdrawals.filter(w=>w.status==='paid').reduce((a,w)=>a+Number(w.value||0),0)
  const pendingWithdraw = withdrawals.filter(w=>w.status==='pending').reduce((a,w)=>a+Number(w.value||0),0)
  const available = Math.max(0, total - paid - pendingWithdraw)
  const minWithdraw = Number(readJson(RESELLER_SETTINGS_FILE, { minWithdraw: 50 }).minWithdraw || 50)
  if (value < minWithdraw) return res.json({ success:false, error:'Valor mínimo para saque: ' + minWithdraw.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) + '.' })
  if (value > available) return res.json({ success:false, error:'Valor maior que o saldo disponível.' })
  const all = readJson(WITHDRAWALS_FILE, [])
  const withdrawal = { id: uid('withdraw'), resellerId: req.reseller.id, resellerName: req.reseller.name, resellerEmail: req.reseller.email, pixKey, value, status:'pending', createdAt:new Date().toISOString() }
  all.unshift(withdrawal)
  writeJson(WITHDRAWALS_FILE, all)
  res.json({ success:true, withdrawal })
})

app.get('/api/admin/resellers', requireAdmin, (req, res) => {
  const resellers = readJson(RESELLERS_FILE, []).map(publicReseller)
  const commissions = readJson(COMMISSIONS_FILE, [])
  const withdrawals = readJson(WITHDRAWALS_FILE, [])
  const settings = readJson(RESELLER_SETTINGS_FILE, { type:'percent', starter:10, pro:20, enterprise:40, minWithdraw:50 })
  const stats = {
    active: resellers.filter(r => r.status === 'approved').length,
    pending: resellers.filter(r => r.status === 'pending').length,
    commissionTotal: commissions.reduce((a,c)=>a+Number(c.value||0),0),
    withdrawPending: withdrawals.filter(w=>w.status==='pending').reduce((a,w)=>a+Number(w.value||0),0),
    referralSales: commissions.length
  }
  res.json({ success:true, resellers, commissions, withdrawals, settings, stats })
})

app.post('/api/admin/resellers/:id/status', requireAdmin, (req, res) => {
  const list = readJson(RESELLERS_FILE, [])
  const idx = list.findIndex(r => r.id === req.params.id)
  if (idx < 0) return res.json({ success:false, error:'Revendedor não encontrado.' })
  list[idx].status = req.body.status || 'approved'
  if (!list[idx].code) list[idx].code = resellerCode(list[idx].name)
  writeJson(RESELLERS_FILE, list)
  res.json({ success:true, reseller: publicReseller(list[idx]) })
})

app.put('/api/admin/reseller-settings', requireAdmin, (req, res) => {
  const settings = {
    type: req.body.type === 'fixed' ? 'fixed' : 'percent',
    starter: Number(req.body.starter || 10),
    pro: Number(req.body.pro || 20),
    enterprise: Number(req.body.enterprise || 40),
    minWithdraw: Number(req.body.minWithdraw || 50)
  }
  writeJson(RESELLER_SETTINGS_FILE, settings)
  res.json({ success:true, settings })
})

app.post('/api/admin/withdrawals/:id/status', requireAdmin, (req, res) => {
  const all = readJson(WITHDRAWALS_FILE, [])
  const idx = all.findIndex(w => w.id === req.params.id)
  if (idx < 0) return res.json({ success:false, error:'Saque não encontrado.' })
  all[idx].status = req.body.status || 'paid'
  all[idx].paidAt = all[idx].status === 'paid' ? new Date().toISOString() : all[idx].paidAt
  writeJson(WITHDRAWALS_FILE, all)
  res.json({ success:true, withdrawal: all[idx] })
})

// Client operational endpoints protected from here
app.use(['/sessions','/connect','/reset','/groups','/ads','/campaign-numbers','/campaign-groups'], requireActiveClient)

app.get('/sessions', (req, res) => {
  const names = new Set(['whatsapp1', 'whatsapp2', 'whatsapp3', ...Object.keys(sessions)])
  res.json([...names].map(name => {
    const s = makeSession(name)
    return {
      name,
      label: displayName(name),
      connected: s.connected,
      starting: s.starting,
      stage: s.stage,
      hasQr: Boolean(s.qr),
      qr: s.qr,
      lastSeen: s.lastSeen,
      sentToday: s.sentToday,
      logs: s.logs
    }
  }))
})

app.post('/connect', async (req, res) => {
  try {
    const name = safeName(req.body.session)
    await connectWhatsApp(name)
    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

app.post('/reset', async (req, res) => {
  try {
    const name = safeName(req.body.session)
    const s = makeSession(name)
    try { if (s.sock) await s.sock.logout() } catch {}
    try { fs.rmSync(sessionPath(name), { recursive: true, force: true }) } catch {}
    resetStateOnly(name)
    log(name, 'Sessão redefinida.')
    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

app.get('/groups', async (req, res) => {
  try {
    const name = safeName(req.query.session)
    const s = makeSession(name)
    if (!s.sock || !s.connected) return res.json([])
    const data = await s.sock.groupFetchAllParticipating()
    res.json(Object.values(data).map(g => ({ id: g.id, name: g.subject })))
  } catch {
    res.json([])
  }
})

app.get('/ads', (req, res) => {
  res.json(readAds().map(publicAd))
})

app.post('/ads', upload.single('media'), (req, res) => {
  try {
    const name = String(req.body.name || '').trim()
    const message = String(req.body.message || '').trim()
    const note = String(req.body.note || '').trim()

    if (!name) return res.json({ success: false, error: 'Informe o nome do anúncio.' })
    if (!message && !req.file) return res.json({ success: false, error: 'Informe texto ou mídia para o anúncio.' })

    const ads = readAds()
    const ad = {
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      name,
      message,
      note,
      mediaPath: req.file?.path || null,
      mediaName: req.file?.originalname || '',
      mimetype: req.file?.mimetype || '',
      createdAt: new Date().toLocaleString()
    }

    ads.unshift(ad)
    writeAds(ads)
    res.json({ success: true, ad: publicAd(ad) })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

app.delete('/ads/:id', (req, res) => {
  try {
    const ads = readAds()
    const found = ads.find(ad => ad.id === req.params.id)
    if (found?.mediaPath) {
      try { if (fs.existsSync(found.mediaPath)) fs.unlinkSync(found.mediaPath) } catch {}
    }
    writeAds(ads.filter(ad => ad.id !== req.params.id))
    res.json({ success: true })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

app.post('/campaign-numbers', upload.fields([
  { name: 'media1', maxCount: 1 },
  { name: 'media2', maxCount: 1 },
  { name: 'media3', maxCount: 1 },
  { name: 'contactsFile', maxCount: 1 }
]), async (req, res) => {
  const allFiles = [...(req.files?.media1 || []), ...(req.files?.media2 || []), ...(req.files?.media3 || []), ...(req.files?.contactsFile || [])]
  try {
    const usable = connectedSessions(parseSelectedSessions(req.body.sessions))
    if (!usable.length) {
      cleanFiles(allFiles)
      return res.json({ success: false, error: 'Nenhum WhatsApp conectado foi selecionado.' })
    }

    const ads = adsForRequest(req)
    if (!ads.length) {
      cleanFiles(allFiles)
      return res.json({ success: false, error: 'Configure ou selecione pelo menos um anúncio.' })
    }

    const targets = mergeTargets(req.body.targets, req.files?.contactsFile?.[0])
    const minDelay = Number(req.body.minDelay || 9000)
    const maxDelay = Number(req.body.maxDelay || 18000)
    const sessionPool = shuffleCopy(usable)
    const adPool = shuffleCopy(ads)

    let sent = 0, failed = 0
    const errors = []

    for (let i = 0; i < targets.length; i++) {
      const parsed = parseTargetLine(targets[i])
      const session = pickRandomBalanced(sessionPool, i)
      const ad = pickRandomBalanced(adPool, i)

      try {
        const found = await findWhatsAppJid(session.sock, parsed.target)
        if (!found.jid) {
          failed++
          errors.push({ target: parsed.target, tried: found.candidates, error: 'Número não localizado no WhatsApp' })
          continue
        }

        const text = applyVars(ad.msg, parsed.vars)
        await session.sock.sendMessage(found.jid, mediaPayload(ad.file, text))
        session.sentToday++
        sent++
        log(session.name, `Contato ${i + 1}/${targets.length} processado com ${ad.name}`)
        if (i < targets.length - 1) await delay(safeDelay(minDelay, maxDelay))
      } catch (err) {
        failed++
        errors.push({ target: parsed.target, session: session.name, error: err.message })
      }
    }

    if ((req.body.adMode || 'manual') === 'manual') cleanFiles(allFiles)
    res.json({ success: true, sent, failed, sessionsUsed: usable.map(s => displayName(s.name)), adsUsed: ads.length, limit: MAX_TARGETS, errors })
  } catch (err) {
    cleanFiles(allFiles)
    res.json({ success: false, error: err.message })
  }
})

app.post('/campaign-groups', upload.fields([
  { name: 'media1', maxCount: 1 },
  { name: 'media2', maxCount: 1 },
  { name: 'media3', maxCount: 1 }
]), async (req, res) => {
  const allFiles = [...(req.files?.media1 || []), ...(req.files?.media2 || []), ...(req.files?.media3 || []), ...(req.files?.contactsFile || [])]
  try {
    const usable = connectedSessions(parseSelectedSessions(req.body.sessions))
    if (!usable.length) {
      cleanFiles(allFiles)
      return res.json({ success: false, error: 'Nenhum WhatsApp conectado foi selecionado.' })
    }

    const ads = adsForRequest(req)
    if (!ads.length) {
      cleanFiles(allFiles)
      return res.json({ success: false, error: 'Configure ou selecione pelo menos um anúncio.' })
    }

    let groups = []
    try { groups = JSON.parse(req.body.groups || '[]') } catch { groups = parseLines(req.body.groups) }
    groups = groups.slice(0, MAX_TARGETS)

    const minDelay = Number(req.body.minDelay || 9000)
    const maxDelay = Number(req.body.maxDelay || 18000)
    const sessionPool = shuffleCopy(usable)
    const adPool = shuffleCopy(ads)

    let sent = 0, failed = 0
    const errors = []

    for (let i = 0; i < groups.length; i++) {
      const session = pickRandomBalanced(sessionPool, i)
      const ad = pickRandomBalanced(adPool, i)

      try {
        await session.sock.sendMessage(groups[i], mediaPayload(ad.file, ad.msg))
        session.sentToday++
        sent++
        log(session.name, `Grupo ${i + 1}/${groups.length} processado com ${ad.name}`)
        if (i < groups.length - 1) await delay(safeDelay(minDelay, maxDelay))
      } catch (err) {
        failed++
        errors.push({ target: groups[i], session: session.name, error: err.message })
      }
    }

    if ((req.body.adMode || 'manual') === 'manual') cleanFiles(allFiles)
    res.json({ success: true, sent, failed, sessionsUsed: usable.map(s => displayName(s.name)), adsUsed: ads.length, limit: MAX_TARGETS, errors })
  } catch (err) {
    cleanFiles(allFiles)
    res.json({ success: false, error: err.message })
  }
})

app.get('/legacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')))

app.listen(PORT, () => {
  console.log('')
  console.log('====================================')
  console.log(' NEX-ZAPP Pro v15 Integrado')
  console.log(' Painel: http://localhost:' + PORT)
  console.log('====================================')
  console.log('')
})
