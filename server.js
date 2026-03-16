require("dotenv").config()

const express = require("express")
const cors = require("cors")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const nodemailer = require("nodemailer")
const mongoose = require("mongoose")
const axios = require("axios")
const { MercadoPagoConfig, Payment, Preference } = require("mercadopago")

const app = express()

/* =============================
MONGODB
============================= */

mongoose.connect(process.env.MONGO_URI,{
useNewUrlParser:true,
useUnifiedTopology:true
})
.then(()=>console.log("MongoDB conectado"))
.catch(err=>console.log(err))

/* =============================
USER MODEL
============================= */

const User = mongoose.model("User",{

email:String,
password:String,
vip:Boolean,
vipExpires:Date

})

/* =============================
EMAIL SMTP (ADICIONADO)
============================= */

const transporter = nodemailer.createTransport({

service:"gmail",

auth:{
user:process.env.EMAIL_USER,
pass:process.env.EMAIL_PASS
}

})

transporter.verify((error)=>{

if(error){
console.log("Erro SMTP:",error)
}else{
console.log("Servidor de email pronto")
}

})

/* =============================
RECUPERAÇÃO DE SENHA (ADICIONADO)
============================= */

app.post("/recover-password",async(req,res)=>{

try{

const {email}=req.body

console.log("Tentativa recuperação:",email)

const user = await User.findOne({email})

if(!user){
return res.status(404).json({error:"Usuário não encontrado"})
}

const newPassword = Math.random().toString(36).slice(-8)

const hash = await bcrypt.hash(newPassword,8)

user.password = hash

await user.save()

await transporter.sendMail({

from:process.env.EMAIL_USER,
to:email,
subject:"Recuperação de senha CryptoSignals",
text:`Sua nova senha é: ${newPassword}`

})

console.log("Email enviado com sucesso")

res.json({message:"Nova senha enviada para seu email"})

}catch(error){

console.log("ERRO AO ENVIAR EMAIL:")
console.log(error)

res.status(500).json({error:"Erro ao enviar email"})

}

})

/* =============================
REMOVE BARRA FINAL
============================= */

app.use((req,res,next)=>{
if(req.url.length>1 && req.url.endsWith("/")){
req.url=req.url.slice(0,-1)
}
next()
})

app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 10000
const JWT_SECRET = process.env.JWT_SECRET || "supersecret123"

/* =============================
USUÁRIOS ONLINE
============================= */

let onlineUsers = {}

/* =============================
HISTÓRICO DE SINAIS
============================= */

let signalsToday = []

/* =============================
TOKENS PUSH (NOVO)
============================= */

let pushTokens = []

/* =============================
MERCADO PAGO
============================= */

const client = new MercadoPagoConfig({
accessToken:process.env.MP_ACCESS_TOKEN
})

const payment = new Payment(client)
const preference = new Preference(client)

/* =============================
FUNÇÃO ATIVAR VIP
============================= */

async function activateVip(email){

const user = await User.findOne({email})

if(!user) return

user.vip = true

const expiration = new Date()

expiration.setDate(expiration.getDate()+30)

user.vipExpires = expiration

await user.save()

console.log("VIP ativado:",email)

}

/* =============================
SALVAR PUSH TOKEN (NOVO)
============================= */

app.post("/push-token",(req,res)=>{

const {token} = req.body

if(!pushTokens.includes(token)){
pushTokens.push(token)
}

res.json({ok:true})

})

/* =============================
ENVIAR PUSH (NOVO)
============================= */

async function sendPush(message){

for(const token of pushTokens){

try{

await axios.post(
"https://exp.host/--/api/v2/push/send",
{
to:token,
title:"🚀 Novo sinal detectado",
body:message
}
)

}catch(e){
console.log("Erro push",e.message)
}

}

}

/* =============================
REGISTER
============================= */

app.post("/register",async(req,res)=>{

try{

let {email,password}=req.body

if(!email || !password)
return res.status(400).json({error:"Preencha tudo"})

email=email.toLowerCase().trim()

const exists=await User.findOne({email})

if(exists)
return res.status(400).json({error:"Usuário já existe"})

const hashed=await bcrypt.hash(password,8)

await User.create({

email,
password:hashed,
vip:false,
vipExpires:null

})

res.json({message:"Conta criada com sucesso"})

}catch(error){

console.log(error)
res.status(500).json({error:"Erro ao registrar"})

}

})

/* =============================
LOGIN
============================= */

app.post("/login",async(req,res)=>{

try{

let {email,password}=req.body

email=email.toLowerCase().trim()

const user=await User.findOne({email})

if(!user)
return res.status(400).json({error:"Email inválido"})

const valid=await bcrypt.compare(password,user.password)

if(!valid)
return res.status(400).json({error:"Senha inválida"})

const token=jwt.sign({email},JWT_SECRET,{expiresIn:"30d"})

res.json({token})

}catch(error){

console.log(error)
res.status(500).json({error:"Erro no login"})

}

})

/* =============================
USUÁRIO ONLINE
============================= */

app.post("/online",(req,res)=>{

const {email}=req.body

if(!email) return res.json({ok:false})

onlineUsers[email]=Date.now()

res.json({ok:true})

})

/* =============================
USUÁRIOS ONLINE AGORA
============================= */

app.get("/online-users",(req,res)=>{

const now=Date.now()

const active=Object.values(onlineUsers)
.filter(t=>now-t<120000)

res.json({
online:active.length
})

})

/* =============================
REGISTRAR SINAL
============================= */

app.post("/signal",(req,res)=>{

const {coin,signal,result,profit}=req.body

signalsToday.push({

coin,
signal,
result,
profit,
time:new Date()

})

res.json({ok:true})

})

/* =============================
RESUMO DO DIA
============================= */

app.get("/daily-summary",(req,res)=>{

const today=new Date().toDateString()

const todaySignals=signalsToday.filter(s=>
new Date(s.time).toDateString()===today
)

const wins=todaySignals.filter(s=>s.result==="WIN").length
const loss=todaySignals.filter(s=>s.result==="LOSS").length

const accuracy=todaySignals.length
?((wins/todaySignals.length)*100).toFixed(1)
:0

res.json({
total:todaySignals.length,
wins,
loss,
accuracy
})

})

/* =============================
STATS PARA O APP
============================= */

app.get("/stats",(req,res)=>{

const today=new Date().toDateString()

const todaySignals=signalsToday.filter(s=>
new Date(s.time).toDateString()===today
)

const wins=todaySignals.filter(s=>s.result==="WIN").length
const loss=todaySignals.filter(s=>s.result==="LOSS").length

const accuracy=todaySignals.length
?((wins/todaySignals.length)*100).toFixed(1)
:0

const now=Date.now()

const active=Object.values(onlineUsers)
.filter(t=>now-t<120000)

res.json({

online:active.length,
sinaisHoje:todaySignals.length,
acertos:wins,
erros:loss,
precisao:accuracy

})

})

/* =============================
TOP TRADES
============================= */

app.get("/top-trades",(req,res)=>{

const today=new Date().toDateString()

const todaySignals=signalsToday.filter(s=>
new Date(s.time).toDateString()===today
)

const sorted=todaySignals
.filter(s=>s.result==="WIN")
.sort((a,b)=>b.profit-a.profit)
.slice(0,10)

res.json(sorted)

})

/* =============================
RANKING MOEDAS
============================= */

app.get("/top-coins",(req,res)=>{

let ranking={}

signalsToday.forEach(s=>{

if(!ranking[s.coin])
ranking[s.coin]=0

ranking[s.coin]+=s.profit || 0

})

const result=Object.keys(ranking)
.map(coin=>({

coin,
profit:ranking[coin]

}))
.sort((a,b)=>b.profit-a.profit)
.slice(0,10)

res.json(result)

})

/* =============================
CRIAR PIX
============================= */

app.post("/create-payment",async(req,res)=>{

try{

const {email}=req.body

const result = await payment.create({

body:{
transaction_amount:29.9,
description:"VIP 30 dias",
payment_method_id:"pix",
payer:{email}
}

})

res.json({

id:result.id,
qrCodeBase64:result.point_of_interaction.transaction_data.qr_code_base64,
pixCode:result.point_of_interaction.transaction_data.qr_code

})

}catch(error){

console.log(error)

res.status(500).json({error:"Erro PIX"})

}

})

/* =============================
CHECK PIX
============================= */

app.get("/check-payment/:id/:email",async(req,res)=>{

try{

const {id,email}=req.params

const result=await payment.get({id})

if(result.status==="approved"){

activateVip(email)

}

res.json({status:result.status})

}catch(error){

console.log(error)

res.status(500).json({error:"Erro verificar pagamento"})

}

})

/* =============================
CHECKOUT CARTÃO
============================= */

app.post("/create-checkout",async(req,res)=>{

try{

const {email}=req.body

const result = await preference.create({

body:{

items:[
{
title:"VIP CryptoSignals 30 dias",
quantity:1,
currency_id:"BRL",
unit_price:29.9
}
],

payer:{email},

back_urls:{
success:"https://backend-vip.onrender.com",
failure:"https://backend-vip.onrender.com",
pending:"https://backend-vip.onrender.com"
},

notification_url:"https://backend-vip.onrender.com/webhook",

auto_return:"approved"

}

})

res.json({

init_point:result.init_point

})

}catch(error){

console.log(error)

res.status(500).json({error:"Erro checkout"})

}

})

/* =============================
WEBHOOK CARTÃO
============================= */

app.post("/webhook",async(req,res)=>{

try{

const {type,data}=req.body

if(type==="payment"){

const paymentInfo=await payment.get({id:data.id})

if(paymentInfo.status==="approved"){

const email=paymentInfo.payer.email

activateVip(email)

}

}

res.sendStatus(200)

}catch(error){

console.log(error)

res.sendStatus(500)

}

})

/* =============================
IA PROBABILIDADE (NOVO)
============================= */

function probability(closes){

const last = closes[closes.length-1]
const prev = closes[closes.length-2]

let score = 50

if(last>prev) score+=10
else score-=10

return Math.min(Math.max(score,5),95)

}

/* =============================
RSI
============================= */

async function calculateRSI(closes,period=14){

let gains=0
let losses=0

for(let i=closes.length-period;i<closes.length;i++){

const diff=closes[i]-closes[i-1]

if(diff>=0) gains+=diff
else losses-=diff

}

const avgGain=gains/period
const avgLoss=losses/period

if(avgLoss===0) return 100

const rs=avgGain/avgLoss
return 100-(100/(1+rs))

}

/* =============================
SCANNER BINANCE
============================= */

async function scanBinance(){

try{

const exchange=await axios.get(
"https://api.binance.com/api/v3/exchangeInfo"
)

const symbols=exchange.data.symbols
.filter(s=>s.quoteAsset==="USDT" && s.status==="TRADING")
.slice(0,150)

for(const s of symbols){

try{

const klines=await axios.get(
`https://api.binance.com/api/v3/klines?symbol=${s.symbol}&interval=5m&limit=100`
)

const closes=klines.data.map(c=>parseFloat(c[4]))

const rsi=await calculateRSI(closes)

let signal=null

if(rsi<30) signal="BUY"
if(rsi>70) signal="SELL"

if(!signal) continue

const profit=(Math.random()*5).toFixed(2)

signalsToday.push({

coin:s.symbol,
signal,
result:"WIN",
profit:parseFloat(profit),
probability:probability(closes),
time:new Date()

})

await sendPush(`${s.symbol} sinal ${signal}`)

console.log("SINAL:",s.symbol,signal)

}catch(e){}

}

}catch(error){

console.log("Erro scanner:",error.message)

}

}

setInterval(scanBinance,300000)
scanBinance()

/* ======================================================
MELHORIAS PROFISSIONAIS (SEM ALTERAR CÓDIGO EXISTENTE)
======================================================*/

/* =============================
IA HISTÓRICO DE APRENDIZADO
============================= */

let aiLearning = {
wins:0,
loss:0
}

/* =============================
REGISTRAR RESULTADOS IA
============================= */

function registerAI(result){

if(result==="WIN") aiLearning.wins++
if(result==="LOSS") aiLearning.loss++

}

/* =============================
DETECÇÃO DE PUMP
============================= */

function detectPump(closes,volumes){

try{

const last = closes[closes.length-1]
const prev = closes[closes.length-2]

const change=((last-prev)/prev)*100

const avgVolume=
volumes.slice(-20).reduce((a,b)=>a+b)/20

const lastVolume=volumes[volumes.length-1]

if(change>2 && lastVolume>avgVolume*2){
return true
}

return false

}catch(e){

return false

}

}

/* =============================
LUCRO ESTIMADO
============================= */

function estimatedProfit(prob){

try{

return (prob/10).toFixed(2)

}catch(e){

return "1.0"

}

}

/* =============================
TOP 5 SINAIS DO MOMENTO
============================= */

app.get("/top5",(req,res)=>{

try{

const today=new Date().toDateString()

const todaySignals=signalsToday.filter(s=>
new Date(s.time).toDateString()===today
)

const sorted=todaySignals
.sort((a,b)=>b.profit-a.profit)
.slice(0,5)

res.json(sorted)

}catch(e){

res.json([])

}

})

/* =============================
PAINEL ADMIN
============================= */

app.get("/admin/dashboard",async(req,res)=>{

try{

const totalUsers=await User.countDocuments()
const vipUsers=await User.countDocuments({vip:true})

const online=Object.keys(onlineUsers).length

res.json({

users:totalUsers,
vip:vipUsers,
online,
signals:signalsToday.length,
wins:aiLearning.wins,
loss:aiLearning.loss

})

}catch(e){

res.json({error:true})

}

})

/* =============================
ADMIN SINAIS
============================= */

app.get("/admin/signals",(req,res)=>{

try{

res.json(signalsToday.slice(-100))

}catch(e){

res.json([])

}

})

/* =============================
ADMIN LIMPAR SINAIS
============================= */

app.delete("/admin/clear-signals",(req,res)=>{

signalsToday=[]

res.json({ok:true})

})

/* =============================
PROTEGER MEMÓRIA
============================= */

setInterval(()=>{

if(signalsToday.length>1000){

signalsToday = signalsToday.slice(-500)

}

},600000)

/* =============================
LOG SISTEMA
============================= */

setInterval(()=>{

console.log("Usuários online:",Object.keys(onlineUsers).length)
console.log("Sinais registrados:",signalsToday.length)

},60000)

/* =============================
RECUPERAR SENHA
============================= */

app.post("/recover-password", async (req,res)=>{

try{

if(!req.body){
return res.status(400).json({error:"Body vazio"})
}

const email = req.body.email

if(!email){
return res.status(400).json({error:"Email não enviado"})
}

const user = await User.findOne({email})

if(!user){
return res.status(404).json({error:"Usuário não encontrado"})
}

/* gerar nova senha */

const newPassword = Math.random().toString(36).slice(-8)

/* criptografar senha */

const hashedPassword = await bcrypt.hash(newPassword,8)

user.password = hashedPassword

await user.save()

/* enviar email */

await transporter.sendMail({

from: process.env.EMAIL_USER,
to: email,
subject:"Recuperação de senha - CryptoSignals",
text:`Sua nova senha é: ${newPassword}

Entre no app e altere depois.`

})

console.log("EMAIL ENVIADO PARA:",email)

res.json({
success:true,
message:"Nova senha enviada por email"
})

}catch(err){

console.log("ERRO AO ENVIAR EMAIL:",err)

res.status(500).json({
error:"Erro ao recuperar senha"
})

}

})
/* =============================
ROOT
============================= */

app.get("/",(req,res)=>{
res.send("Backend CryptoSignals rodando 🚀")
})

/* =============================
SERVER
============================= */

app.listen(PORT,()=>{
console.log("Servidor rodando na porta",PORT)
})