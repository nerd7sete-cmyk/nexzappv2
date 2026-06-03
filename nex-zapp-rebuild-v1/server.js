
const express = require('express')
const fs = require('fs')
const path = require('path')
const multer = require('multer')
const mime = require('mime-types')
const QRCode = require('qrcode')
const XLSX = require('xlsx')
const P = require('pino')
const { Boom } = require('@hapi/boom')
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')

const app = express()
const PORT = Number(process.env.PORT || 4000)
const ROOT = __dirname
const DATA = path.join(ROOT, 'data')
const UPLOADS = path.join(ROOT, 'uploads')
const AUTH = path.join(ROOT, 'auth')

for (const p of [DATA, UPLOADS, AUTH]) fs.mkdirSync(p, { recursive: true })

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))
app.use('/uploads', express.static(UPLOADS))
app.use(express.static(path.join(ROOT, 'public'), { index: false }))

const files = {
  users: path.join(DATA, 'users.json'),
  plans: path.join(DATA, 'plans.json'),
  settings: path.join(DATA, 'settings.json'),
  landing: path.join(DATA, 'landing.json'),
  orders: path.join(DATA, 'orders.json'),
  payments: path.join(DATA, 'payments.json'),
  ads: path.join(DATA, 'ads.json'),
  resellers: path.join(DATA, 'resellers.json'),
  commissions: path.join(DATA, 'commissions.json'),
  withdrawals: path.join(DATA, 'withdrawals.json')
}

function uid(prefix='id'){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8) }
function read(file, fallback){ try { return JSON.parse(fs.readFileSync(file,'utf8')) } catch { return fallback } }
function write(file, data){ fs.writeFileSync(file, JSON.stringify(data, null, 2)) }
function ensure(file, fallback){ if(!fs.existsSync(file)) write(file, fallback) }
function money(n){ return Number(n||0) }
function now(){ return new Date().toISOString() }
function todayPlus(days){ return new Date(Date.now()+Number(days||30)*86400000).toISOString().slice(0,10) }
function onlyNum(v){ return String(v||'').replace(/\D/g,'') }
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim()) }

ensure(files.users, [
  {id:'admin', role:'admin', name:'Admin', email:'admin@nexzapp.local', password:'admin123', status:'active', planId:'enterprise', expiresAt:'2099-12-31', createdAt:now()},
  {id:'cliente-demo', role:'client', name:'Cliente Demo', email:'cliente@nexzapp.local', password:'123456', phone:'5599999999999', status:'active', planId:'pro', planName:'Pro', expiresAt:'2099-12-31', createdAt:now()}
])
ensure(files.plans, [
  {id:'starter', name:'Starter', price:49.90, whatsappLimit:1, sendLimit:500, durationDays:30, groups:false, ads:true, active:true, featured:false, description:'Ideal para começar.'},
  {id:'pro', name:'Pro', price:97.90, whatsappLimit:3, sendLimit:9999, durationDays:60, groups:true, ads:true, active:true, featured:true, description:'Plano completo para operação comercial.'},
  {id:'enterprise', name:'Enterprise', price:197.90, whatsappLimit:10, sendLimit:99999, durationDays:90, groups:true, ads:true, active:true, featured:false, description:'Para equipes e operações maiores.'}
])
ensure(files.settings, {pixKey:'black7original@gmail.com', pixName:'NEX-ZAPP', pixCity:'SAO PAULO', supportPhone:'5599999999999', receiptWhatsapp:'5599999999999', instruction:'Envie o comprovante pelo WhatsApp para liberação mais rápida. Caso não envie, aguarde até 30 minutos após a confirmação do pagamento.', commissionType:'percent', commissionStarter:10, commissionPro:20, commissionEnterprise:40, minWithdraw:50})
ensure(files.landing, {title:'Transforme seu WhatsApp em uma central de campanhas', subtitle:'Envie campanhas por lista e grupos com múltiplos WhatsApps, anúncios alternados e painel profissional.', primaryButton:'Comprar agora', secondaryButton:'Entrar agora'})
for (const k of ['orders','payments','ads','resellers','commissions','withdrawals']) ensure(files[k], [])

const authTokens = {}
function publicUser(u){ const {password, ...rest}=u; return rest }
function requireLogin(req,res,next){
  const token = String(req.headers.authorization||'').replace(/^Bearer\s+/,'')
  const email = authTokens[token]
  const user = read(files.users, []).find(u=>String(u.email).toLowerCase()===String(email).toLowerCase())
  if(!user) return res.status(401).json({success:false,error:'Não autenticado.'})
  req.user=user; next()
}
function requireAdmin(req,res,next){ requireLogin(req,res,()=> req.user.role==='admin' ? next() : res.status(403).json({success:false,error:'Acesso negado.'})) }
function requireReseller(req,res,next){ requireLogin(req,res,()=> req.user.role==='reseller' || req.user.role==='admin' ? next() : res.status(403).json({success:false,error:'Acesso negado.'})) }

const storage = multer.diskStorage({
  destination: UPLOADS,
  filename: (_, file, cb) => cb(null, Date.now()+'-'+Math.random().toString(16).slice(2)+path.extname(file.originalname||''))
})
const upload = multer({storage, limits:{fileSize:160*1024*1024, files:8}})

function normalizeBR(raw){
  let n=onlyNum(raw)
  const set=new Set()
  const add=v=>{ v=onlyNum(v); if(v.length>=10&&v.length<=15)set.add(v) }
  if(!n) return []
  if(n.startsWith('00')) n=n.slice(2)
  if(!n.startsWith('55')){
    if(n.length===11) add('55'+n)
    if(n.length===10){ add('55'+n); add('55'+n.slice(0,2)+'9'+n.slice(2)) }
  }
  add(n)
  if(n.startsWith('55') && n.length===12) add('55'+n.slice(2,4)+'9'+n.slice(4))
  if(n.startsWith('55') && n.length===13 && n[4]==='9') add('55'+n.slice(2,4)+n.slice(5))
  return [...set].sort((a,b)=>(((b.startsWith('55')?2:0)+(b.length===13?1:0))-((a.startsWith('55')?2:0)+(a.length===13?1:0))))
}
function parseTargetLine(line){
  const parts=String(line||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean)
  const phone=parts.shift()||''
  const vars={}
  for(const p of parts){ const [k,...rest]=p.split('='); if(k&&rest.length) vars[k.trim()]=rest.join('=').trim() }
  return {phone, vars}
}
function parseTargets(text){
  return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(parseTargetLine)
}
function spintax(text){
  let out=String(text||'')
  for(let i=0;i<10;i++){
    const next=out.replace(/\{([^{}]+)\}/g, (_, g)=>{
      const opts=g.split('|').map(x=>x.trim()).filter(Boolean)
      return opts.length?opts[Math.floor(Math.random()*opts.length)]:''
    })
    if(next===out) break
    out=next
  }
  return out
}
function applyVars(text, vars={}){
  return spintax(String(text||'').replace(/\{([a-zA-Z0-9_]+)\}/g, (m,k)=> vars[k] ?? m))
}
function shuffle(arr){ return [...arr].sort(()=>Math.random()-.5) }
function delay(ms){ return new Promise(r=>setTimeout(r,ms)) }
function mediaPayload(item, msg){
  const text = String(msg || '').trim()
  if(!item || !item.mediaPath){
    if(!text) throw new Error('Mensagem vazia. Preencha o texto ou envie uma mídia.')
    return {text}
  }
  if(!fs.existsSync(item.mediaPath)) throw new Error('Arquivo de mídia não encontrado no servidor.')
  const type=item.mimetype || mime.lookup(item.mediaPath) || 'application/octet-stream'
  const buffer = fs.readFileSync(item.mediaPath)
  const fileName = item.mediaName || path.basename(item.mediaPath) || 'arquivo'
  if(type.startsWith('image/')){
    const payload = {image: buffer, mimetype:type}
    if(text) payload.caption = text
    return payload
  }
  if(type.startsWith('video/')){
    const payload = {video: buffer, mimetype:type}
    if(text) payload.caption = text
    return payload
  }
  const payload = {document: buffer, mimetype:type, fileName}
  if(text) payload.caption = text
  return payload
}

const sessions={}
function display(name){ return ({whatsapp1:'WhatsApp 01', whatsapp2:'WhatsApp 02', whatsapp3:'WhatsApp 03'}[name]||name) }
function safeName(n){ return String(n||'whatsapp1').replace(/[^a-z0-9_-]/gi,'') || 'whatsapp1' }
function authPath(n){ return path.join(AUTH, safeName(n)) }
function sess(n){
  n=safeName(n)
  if(!sessions[n]) sessions[n]={name:n,label:display(n),sock:null,qr:null,connected:false,starting:false,stage:'offline',sentToday:0,lastSeen:null,logs:[],reconnectTimer:null,reconnectAttempts:0,manualStop:false}
  return sessions[n]
}
function log(n,msg){ const s=sess(n); const line='['+new Date().toLocaleTimeString()+'] '+msg; s.logs.unshift(line); s.logs=s.logs.slice(0,80); console.log('['+display(n)+'] '+msg) }
function scheduleReconnect(n, code){
  const s=sess(n)
  if(s.manualStop) return
  if(s.reconnectTimer) clearTimeout(s.reconnectTimer)
  s.stage=code===515?'syncing':'reconnecting'; s.connected=false; s.starting=false
  s.reconnectAttempts=Math.min((s.reconnectAttempts||0)+1,10)
  const ms=Math.min(45000,2000*s.reconnectAttempts)
  log(n,'Reconexão automática em '+Math.round(ms/1000)+'s')
  s.reconnectTimer=setTimeout(()=>{ s.reconnectTimer=null; s.sock=null; connectWhatsApp(n).catch(e=>log(n,'Falha ao reconectar: '+e.message)) }, ms)
}
async function connectWhatsApp(name){
  name=safeName(name); const s=sess(name); s.manualStop=false
  if(s.starting) return log(name,'Conexão em andamento.')
  if(s.connected && s.sock) return log(name,'Já conectado.')
  s.starting=true; s.stage='starting'; s.qr=null
  const {state, saveCreds}=await useMultiFileAuthState(authPath(name))
  const {version}=await fetchLatestBaileysVersion()
  const sock=makeWASocket({
    version, auth:state, logger:P({level:'silent'}),
    browser:['NEX-ZAPP','Chrome','1.0'],
    syncFullHistory:false, markOnlineOnConnect:false, generateHighQualityLinkPreview:false,
    connectTimeoutMs:60000, defaultQueryTimeoutMs:60000, keepAliveIntervalMs:25000, retryRequestDelayMs:2000,
    shouldSyncHistoryMessage:()=>false, emitOwnEvents:false
  })
  s.sock=sock
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async update=>{
    const {connection, qr, lastDisconnect}=update
    if(qr){ s.qr=await QRCode.toDataURL(qr); s.stage='qr'; s.starting=false; s.connected=false; log(name,'QR gerado.') }
    if(connection==='connecting') s.stage=s.qr?'qr':'starting'
    if(connection==='open'){ s.connected=true; s.starting=false; s.qr=null; s.stage='connected'; s.lastSeen=new Date().toLocaleString(); s.reconnectAttempts=0; if(s.reconnectTimer)clearTimeout(s.reconnectTimer); try{ await sock.sendPresenceUpdate('unavailable') }catch{}; log(name,'Conectado.') }
    if(connection==='close'){
      s.connected=false; s.starting=false
      const err=lastDisconnect?.error
      const code=err instanceof Boom ? err.output.statusCode : err?.output?.statusCode
      log(name,'Conexão fechada. Código '+(code||'sem código'))
      if(code===DisconnectReason.loggedOut || code===401 || code===405){ try{fs.rmSync(authPath(name),{recursive:true,force:true})}catch{}; s.stage='error'; s.manualStop=true; log(name,'Sessão removida. Gere novo QR.'); return }
      scheduleReconnect(name, code)
    }
  })
}
setInterval(()=>{ for(const n of ['whatsapp1','whatsapp2','whatsapp3']){ const s=sess(n); if(fs.existsSync(authPath(n)) && !s.connected && !s.starting && !s.reconnectTimer && s.stage!=='qr' && s.stage!=='error') scheduleReconnect(n,0) } }, 60000)

app.get('/', (_,res)=>res.sendFile(path.join(ROOT,'public','landing.html')))
app.get('/app', (_,res)=>res.sendFile(path.join(ROOT,'public','app.html')))
app.get('/admin', (_,res)=>res.sendFile(path.join(ROOT,'public','admin.html')))
app.get('/revenda', (_,res)=>res.sendFile(path.join(ROOT,'public','revenda.html')))

app.post('/api/login',(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase()
  const password=String(req.body.password||'').trim()
  const user=read(files.users,[]).find(u=>String(u.email||'').trim().toLowerCase()===email && String(u.password||'').trim()===password)
  if(!user) return res.json({success:false,error:'E-mail ou senha incorretos.'})
  if(user.status && user.status!=='active' && user.role!=='admin') return res.json({success:false,error:'Acesso bloqueado ou pendente.'})
  const token=uid('token'); authTokens[token]=user.email
  res.json({success:true, token, user:publicUser(user), role:user.role})
})
app.get('/api/me', requireLogin, (req,res)=>{
  const plan=read(files.plans,[]).find(p=>p.id===req.user.planId)||null
  const expired=req.user.expiresAt && req.user.expiresAt < new Date().toISOString().slice(0,10)
  res.json({success:true,user:publicUser(req.user),plan,expired})
})

app.get('/api/public', (_,res)=>res.json({success:true, plans:read(files.plans,[]).filter(p=>p.active!==false), settings:read(files.settings,{}), landing:read(files.landing,{})}))
app.post('/api/order',(req,res)=>{
  const plans=read(files.plans,[])
  const plan=plans.find(p=>p.id===String(req.body.planId||'pro')) || plans.find(p=>p.id==='pro') || plans[0]
  if(!plan) return res.json({success:false,error:'Nenhum plano configurado.'})
  const name=String(req.body.name||'').trim(), email=String(req.body.email||'').trim().toLowerCase(), phone=onlyNum(req.body.phone)
  const password=String(req.body.password||'').trim()
  if(name.length<3) return res.json({success:false,error:'Informe seu nome.'})
  if(!validEmail(email)) return res.json({success:false,error:'Informe um e-mail válido.'})
  if(phone.length<10) return res.json({success:false,error:'Informe um WhatsApp válido.'})
  if(password.length<6) return res.json({success:false,error:'Crie uma senha com pelo menos 6 caracteres.'})
  const order={id:uid('order'), type:'new', name, payerName:String(req.body.payerName||name).trim(), email, phone, password, planId:plan.id, planName:plan.name, value:money(plan.price), durationDays:Number(plan.durationDays||30), status:'pending', refCode:String(req.body.ref||'').trim().toUpperCase(), createdAt:now()}
  const list=read(files.orders,[]); list.unshift(order); write(files.orders,list)
  res.json({success:true, order, settings:read(files.settings,{})})
})
app.get('/api/billing', requireLogin, (req,res)=>{
  res.json({success:true,user:publicUser(req.user),plan:read(files.plans,[]).find(p=>p.id===req.user.planId),plans:read(files.plans,[]).filter(p=>p.active!==false),settings:read(files.settings,{}),payments:read(files.payments,[]).filter(p=>p.userEmail===req.user.email)})
})
app.post('/api/billing/request', requireLogin, (req,res)=>{
  const plan=read(files.plans,[]).find(p=>p.id===String(req.body.planId||req.user.planId))
  if(!plan) return res.json({success:false,error:'Plano inválido.'})
  const order={id:uid('renew'), type:'renewal', name:req.user.name,email:req.user.email,phone:req.user.phone||'', planId:plan.id, planName:plan.name,value:money(plan.price),durationDays:Number(plan.durationDays||30),status:'pending',createdAt:now()}
  const list=read(files.orders,[]); list.unshift(order); write(files.orders,list)
  res.json({success:true, order, settings:read(files.settings,{})})
})

app.get('/api/admin/all', requireAdmin, (req,res)=>res.json({success:true, users:read(files.users,[]), plans:read(files.plans,[]), orders:read(files.orders,[]), payments:read(files.payments,[]), settings:read(files.settings,{}), landing:read(files.landing,{}), resellers:read(files.resellers,[]), commissions:read(files.commissions,[]), withdrawals:read(files.withdrawals,[])}))
app.put('/api/admin/settings', requireAdmin, (req,res)=>{
  const cur=read(files.settings,{})
  const body=req.body||{}
  const settings={...cur,
    pixKey:String(body.pixKey??cur.pixKey??'').trim(), pixName:String(body.pixName??cur.pixName??'NEX-ZAPP').trim(), pixCity:String(body.pixCity??cur.pixCity??'SAO PAULO').trim(),
    supportPhone:onlyNum(body.supportPhone??cur.supportPhone??''), receiptWhatsapp:onlyNum(body.receiptWhatsapp??cur.receiptWhatsapp??body.supportPhone??cur.supportPhone??''),
    instruction:String(body.instruction??cur.instruction??'').trim(),
    commissionType:String(body.commissionType??cur.commissionType??'percent'),
    commissionStarter:Number(body.commissionStarter??cur.commissionStarter??10),
    commissionPro:Number(body.commissionPro??cur.commissionPro??20),
    commissionEnterprise:Number(body.commissionEnterprise??cur.commissionEnterprise??40),
    minWithdraw:Number(body.minWithdraw??cur.minWithdraw??50)
  }
  write(files.settings,settings); res.json({success:true,settings})
})
app.put('/api/admin/landing', requireAdmin, (req,res)=>{ const cur=read(files.landing,{}); const obj={...cur,title:String(req.body.title??cur.title??'').trim(),subtitle:String(req.body.subtitle??cur.subtitle??'').trim(),primaryButton:String(req.body.primaryButton??cur.primaryButton??'Comprar agora').trim(),secondaryButton:String(req.body.secondaryButton??cur.secondaryButton??'Entrar agora').trim()}; write(files.landing,obj); res.json({success:true,landing:obj}) })
app.put('/api/admin/plans', requireAdmin, (req,res)=>{ const plans=(req.body.plans||[]).map(p=>({id:String(p.id||uid('plan')).replace(/^new-/,'plan-'),name:String(p.name||'Plano'),price:Number(p.price||0),whatsappLimit:Number(p.whatsappLimit||1),sendLimit:Number(p.sendLimit||500),durationDays:Number(p.durationDays||30),groups:!!p.groups,ads:p.ads!==false,active:p.active!==false,featured:!!p.featured,description:String(p.description||'')})); write(files.plans,plans); res.json({success:true,plans}) })
app.post('/api/admin/users', requireAdmin, (req,res)=>{
  const users=read(files.users,[]); const email=String(req.body.email||'').trim().toLowerCase()
  if(!validEmail(email)) return res.json({success:false,error:'E-mail inválido.'})
  if(users.find(u=>u.email===email)) return res.json({success:false,error:'E-mail já existe.'})
  const plan=read(files.plans,[]).find(p=>p.id===req.body.planId)
  const u={id:uid('user'),role:'client',name:req.body.name||'Cliente',email,password:String(req.body.password||'123456'),phone:onlyNum(req.body.phone),planId:req.body.planId||'pro',planName:plan?.name||req.body.planName||'Pro',expiresAt:req.body.expiresAt||todayPlus(plan?.durationDays||30),status:req.body.status||'active',createdAt:now()}
  users.unshift(u); write(files.users,users); res.json({success:true,user:publicUser(u)})
})
app.put('/api/admin/users/:id', requireAdmin, (req,res)=>{ const users=read(files.users,[]); const i=users.findIndex(u=>u.id===req.params.id); if(i<0)return res.json({success:false,error:'Cliente não encontrado.'}); users[i]={...users[i],...req.body}; if(req.body.phone)users[i].phone=onlyNum(req.body.phone); write(files.users,users); res.json({success:true,user:publicUser(users[i])}) })
app.post('/api/admin/orders/:id/cancel', requireAdmin, (req,res)=>{ const orders=read(files.orders,[]); const i=orders.findIndex(o=>o.id===req.params.id); if(i<0)return res.json({success:false,error:'Pedido não encontrado.'}); orders[i].status='canceled'; orders[i].canceledAt=now(); write(files.orders,orders); res.json({success:true,order:orders[i]}) })
function makeCommission(order){
  const ref=String(order.refCode||'').trim().toUpperCase(); if(!ref)return
  const resellers=read(files.resellers,[]); const r=resellers.find(x=>String(x.code||'').toUpperCase()===ref && x.status==='approved'); if(!r)return
  const commissions=read(files.commissions,[]); if(commissions.find(c=>c.orderId===order.id))return
  const st=read(files.settings,{})
  const planKey=String(order.planId||'pro').toLowerCase()
  const raw=Number(st['commission'+planKey.charAt(0).toUpperCase()+planKey.slice(1)] ?? st.commissionPro ?? 20)
  const value=st.commissionType==='fixed'?raw:Number((money(order.value)*raw/100).toFixed(2))
  commissions.unshift({id:uid('comm'),orderId:order.id,resellerId:r.id,resellerName:r.name,resellerEmail:r.email,resellerCode:r.code,clientName:order.name,clientEmail:order.email,planName:order.planName,saleValue:money(order.value),value,status:'available',createdAt:now()})
  write(files.commissions,commissions)
}
app.post('/api/admin/orders/:id/approve', requireAdmin, (req,res)=>{
  const orders=read(files.orders,[]); const i=orders.findIndex(o=>o.id===req.params.id); if(i<0)return res.json({success:false,error:'Pedido não encontrado.'})
  const order=orders[i], users=read(files.users,[]), plans=read(files.plans,[]), plan=plans.find(p=>p.id===order.planId)||plans[0]
  let u=users.find(x=>String(x.email).toLowerCase()===String(order.email).toLowerCase())
  const exp=todayPlus(order.durationDays||plan?.durationDays||30)
  if(!u){ u={id:uid('user'),role:'client',name:order.name,email:order.email,password:order.password||'123456',phone:order.phone,planId:order.planId,planName:order.planName,expiresAt:exp,status:'active',createdAt:now()}; users.unshift(u) }
  else { u.name=order.name||u.name; u.phone=order.phone||u.phone; u.planId=order.planId; u.planName=order.planName; u.expiresAt=exp; u.status='active'; if(order.password)u.password=order.password }
  order.status='approved'; order.approvedAt=now(); order.userId=u.id; orders[i]=order
  write(files.users,users); write(files.orders,orders)
  const pays=read(files.payments,[]); if(!pays.find(p=>p.orderId===order.id)){ pays.unshift({id:uid('pay'),orderId:order.id,userId:u.id,userEmail:u.email,name:u.name,planId:order.planId,planName:order.planName,value:money(order.value),status:'paid',paidAt:now()}); write(files.payments,pays) }
  makeCommission(order)
  res.json({success:true,order,user:publicUser(u)})
})

app.post('/api/reseller/apply',(req,res)=>{
  const name=String(req.body.name||'').trim(), email=String(req.body.email||'').trim().toLowerCase(), phone=onlyNum(req.body.phone), pixKey=String(req.body.pixKey||'').trim(), password=String(req.body.password||'').trim()
  if(name.length<3||!validEmail(email)||phone.length<10||!pixKey||password.length<6) return res.json({success:false,error:'Preencha todos os dados corretamente.'})
  const list=read(files.resellers,[]); if(list.find(r=>r.email===email)) return res.json({success:false,error:'Revendedor já cadastrado.'})
  const code=('R'+Math.random().toString(36).slice(2,8)).toUpperCase()
  const r={id:uid('res'),name,email,phone,city:req.body.city||'',pixKey,password,code,status:'pending',createdAt:now()}
  list.unshift(r); write(files.resellers,list); res.json({success:true,message:'Solicitação enviada.',reseller:r})
})
app.get('/api/reseller/me', requireReseller, (req,res)=>{
  const resellers=read(files.resellers,[]); const r=resellers.find(x=>x.email===req.user.email) || resellers.find(x=>x.id===req.user.resellerId)
  const commissions=read(files.commissions,[]).filter(c=>c.resellerId===r?.id)
  const withdrawals=read(files.withdrawals,[]).filter(w=>w.resellerId===r?.id)
  const total=commissions.reduce((a,c)=>a+money(c.value),0), paid=withdrawals.filter(w=>w.status==='paid').reduce((a,w)=>a+money(w.value),0), pending=withdrawals.filter(w=>w.status==='pending').reduce((a,w)=>a+money(w.value),0)
  res.json({success:true,reseller:r,commissions,withdrawals,stats:{total,paid,pending,available:Math.max(0,total-paid-pending)}})
})
app.post('/api/reseller/withdraw', requireReseller, (req,res)=>{ const r=read(files.resellers,[]).find(x=>x.email===req.user.email || x.id===req.user.resellerId); if(!r)return res.json({success:false,error:'Revendedor não encontrado.'}); const value=money(req.body.value); const list=read(files.withdrawals,[]); list.unshift({id:uid('wd'),resellerId:r.id,resellerName:r.name,resellerEmail:r.email,pixKey:r.pixKey,value,status:'pending',createdAt:now()}); write(files.withdrawals,list); res.json({success:true}) })
app.post('/api/admin/resellers/:id/status', requireAdmin, (req,res)=>{
  const r=read(files.resellers,[])
  const i=r.findIndex(x=>x.id===req.params.id)
  if(i<0)return res.json({success:false,error:'Revendedor não encontrado.'})
  r[i].status=req.body.status||'approved'
  write(files.resellers,r)
  let users=read(files.users,[])
  let u=users.find(x=>String(x.email).toLowerCase()===String(r[i].email).toLowerCase())
  if(r[i].status==='approved'){
    if(!u){
      users.unshift({id:uid('user'),role:'reseller',resellerId:r[i].id,name:r[i].name,email:r[i].email,password:r[i].password,phone:r[i].phone,status:'active',createdAt:now()})
    }else{
      u.role='reseller'; u.resellerId=r[i].id; u.status='active'; if(r[i].password)u.password=r[i].password
    }
    write(files.users,users)
  }
  res.json({success:true,reseller:r[i]})
})
app.delete('/ads/:id', requireLogin, (req,res)=>{ const ads=read(files.ads,[]); const ad=ads.find(a=>a.id===req.params.id); if(ad&&ad.mediaPath)try{fs.unlinkSync(ad.mediaPath)}catch{}; write(files.ads, ads.filter(a=>a.id!==req.params.id || (a.userEmail!==req.user.email && req.user.role!=='admin'))); res.json({success:true}) })

function buildCampaignAds(req, filesUpload){
  const saved=read(files.ads,[])
  let savedIds=[]; try{ savedIds=JSON.parse(req.body.savedAds||'[]') }catch{}
  const picked=saved.filter(a=>savedIds.includes(a.id) && (a.userEmail===req.user.email || req.user.role==='admin'))
  let manual=[]
  for(let i=1;i<=3;i++){
    const msg = req.body['msg'+i] ?? req.body['Msg'+i] ?? req.body['gMsg'+i] ?? req.body['gmsg'+i] ?? ''
    const f=(filesUpload||[]).find(x=>x.fieldname==='media'+i || x.fieldname==='Media'+i || x.fieldname==='gMedia'+i || x.fieldname==='gmedia'+i)
    if(String(msg).trim()||f){
      manual.push({id:'manual'+i,name:'Manual '+i,message:String(msg||''),mediaPath:f?.path||'',mediaName:f?.originalname||'',mimetype:f?.mimetype||mime.lookup(f?.originalname||'')||''})
    }
  }
  const mode=req.body.adMode||req.body.gAdMode||req.body.gadMode||'mix'
  let ads=mode==='saved'?picked:mode==='manual'?manual:[...manual,...picked]
  return ads.length?shuffle(ads):[{id:'default',message:req.body.message||'',mediaPath:''}]
}
async function sendToTarget(sessionName, jid, payload){
  const s=sess(sessionName); if(!s.connected||!s.sock) throw new Error(display(sessionName)+' não conectado')
  try{
    await s.sock.sendMessage(jid, payload)
  }catch(e){
    if(payload && payload.video){
      const doc={document: payload.video, mimetype: payload.mimetype || 'video/mp4', fileName: 'video.' + ((payload.mimetype||'video/mp4').split('/')[1] || 'mp4')}
      if(payload.caption) doc.caption=payload.caption
      await s.sock.sendMessage(jid, doc)
    }else{
      throw e
    }
  }
  try{ await s.sock.sendPresenceUpdate('unavailable') }catch{}
  s.sentToday=(s.sentToday||0)+1
}
app.post('/campaign', requireLogin, upload.any(), async(req,res)=>{
  try{
    const sessions=JSON.parse(req.body.sessions||'[]').filter(Boolean); if(!sessions.length)return res.json({success:false,error:'Selecione um WhatsApp conectado.'})
    let targets=parseTargets(req.body.targets||'')
    if(req.files?.find(f=>f.fieldname==='listFile')){ const f=req.files.find(f=>f.fieldname==='listFile'); const wb=XLSX.readFile(f.path); const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}); targets.push(...rows.map(r=>({phone:r.telefone||r.Telefone||r.numero||r['número']||r.celular||r.Celular||r.phone||r.whatsapp||r.WhatsApp||Object.values(r)[0],vars:r}))) }
    targets=shuffle(targets)
    const ads=buildCampaignAds(req, req.files)
    const min=Number(req.body.minDelay||5000), max=Number(req.body.maxDelay||12000)
    let sent=0, failed=0, errors=[]
    for(let i=0;i<targets.length;i++){
      const t=targets[i], nums=normalizeBR(t.phone); if(!nums.length){failed++;errors.push({target:t.phone,error:'telefone inválido'});continue}
      const ad=ads[i%ads.length], session=sessions[i%sessions.length], jid=nums[0]+'@s.whatsapp.net'
      const msg=applyVars(ad.message,{...t.vars,nome:t.vars.nome||t.vars.name||'',telefone:nums[0],plano:req.user.planName||'',empresa:'NEX-ZAPP',data:new Date().toLocaleDateString('pt-BR')})
      try{ await sendToTarget(session,jid,mediaPayload(ad,msg)); sent++ }catch(e){ failed++; errors.push({target:nums[0],error:e.message}) }
      if(i<targets.length-1) await delay(min+Math.random()*(max-min))
    }
    res.json({success:true,sent,failed,adsUsed:ads.length,sessionsUsed:sessions,errors:errors.slice(0,20)})
  }catch(e){ res.json({success:false,error:e.message}) }
})
app.post('/campaign-groups', requireLogin, upload.any(), async(req,res)=>{
  try{
    const sessions=JSON.parse(req.body.sessions||'[]').filter(Boolean)
    let groups=JSON.parse(req.body.groups||'[]').filter(Boolean)
    if(!groups.length)return res.json({success:false,error:'Selecione pelo menos um grupo.'})
    const ads=buildCampaignAds(req, req.files), min=Number(req.body.minDelay||9000), max=Number(req.body.maxDelay||18000)
    let sent=0, failed=0, errors=[], list=shuffle(groups)
    for(let i=0;i<list.length;i++){
      const group=list[i]
      const groupId = typeof group === 'string' ? group : (group.id || group.jid)
      const ownerSession = typeof group === 'string' ? (sessions[0] || '') : (group.session || group.ownerSession || group.whatsapp || '')
      const session = ownerSession || sessions[i%sessions.length]
      if(!session){ failed++; errors.push({target:groupId,error:'Grupo sem WhatsApp responsável.'}); continue }
      const ad=ads[i%ads.length]
      const msg=applyVars(ad.message,{grupo:group.name||'',empresa:'NEX-ZAPP',data:new Date().toLocaleDateString('pt-BR'),whatsapp:display(session)})
      try{ await sendToTarget(session,groupId,mediaPayload(ad,msg)); sent++ }
      catch(e){ failed++; errors.push({target:group.name||groupId,error:e.message,session}) }
      if(i<list.length-1) await delay(min+Math.random()*(max-min))
    }
    res.json({success:true,sent,failed,adsUsed:ads.length,sessionsUsed:[...new Set(list.map(g=>typeof g==='string'?(sessions[0]||''):(g.session||g.ownerSession||g.whatsapp||'')).filter(Boolean))],errors:errors.slice(0,20)})
  }catch(e){ res.json({success:false,error:e.message}) }
})

app.get('/api/admin/diagnostic', requireAdmin, (_,res)=>res.json({success:true,dataRoot:DATA,files}))
app.listen(PORT, ()=>console.log('NEX-ZAPP Rebuild V1 rodando na porta '+PORT))
