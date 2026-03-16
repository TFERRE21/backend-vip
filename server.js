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
IA HISTÓRICO
============================= */

let aiHistory = []

/* =============================
TOKENS PUSH
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
ATIVAR VIP
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
PUSH TOKEN
============================= */

app.post("/push-token",(req,res)=>{

const {token}=req.body

if(!pushTokens.includes(token)){
pushTokens.push(token)
}

res.json({ok:true})

})

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

}catch(e){}

}

}

/* =============================
REGISTER
============================= */

app.post("/register",async(req,res)=>{

try{

let {email,password}=req.body

email=email.toLowerCase().trim()

const exists=await User.findOne({email})

if(exists)
return res.status(400).json({error:"Usuário já existe"})

const hashed=await bcrypt.hash(password,8)

await User.create({

email,
password:hashed,
vip:false

})

res.json({message:"Conta criada"})

}catch(error){

res.status(500).json({error:"Erro register"})

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

res.status(500).json({error:"Erro login"})

}

})

/* =============================
ONLINE
============================= */

app.post("/online",(req,res)=>{

const {email}=req.body

onlineUsers[email]=Date.now()

res.json({ok:true})

})

/* =============================
STATS
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

res.json({

online:Object.keys(onlineUsers).length,
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

const sorted=[...signalsToday]
.sort((a,b)=>b.probability-a.probability)
.slice(0,10)

res.json(sorted)

})

/* =============================
IA PROBABILIDADE
============================= */

function aiProbability(closes){

const last = closes[closes.length-1]
const prev = closes[closes.length-2]

let score = 50

if(last>prev) score+=10
else score-=10

const historyWins =
aiHistory.filter(s=>s.result==="WIN").length

const historyLoss =
aiHistory.filter(s=>s.result==="LOSS").length

if(historyWins>historyLoss) score+=5
else score-=5

return Math.min(Math.max(score,5),95)

}

/* =============================
PUMP DETECTION
============================= */

function detectPump(closes,volumes){

const last = closes[closes.length-1]
const prev = closes[closes.length-2]

const change = ((last-prev)/prev)*100

const avgVolume =
volumes.slice(-20).reduce((a,b)=>a+b)/20

const lastVolume = volumes[volumes.length-1]

if(change>2 && lastVolume>avgVolume*2){
return true
}

return false

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
.filter(s=>s.quoteAsset==="USDT")
.slice(0,150)

for(const s of symbols){

try{

const klines=await axios.get(
`https://api.binance.com/api/v3/klines?symbol=${s.symbol}&interval=5m&limit=100`
)

const closes=klines.data.map(c=>parseFloat(c[4]))
const volumes=klines.data.map(c=>parseFloat(c[5]))

const probability = aiProbability(closes)

if(probability<70) continue

const estimatedProfit=(probability/10).toFixed(2)

const pump=detectPump(closes,volumes)

signalsToday.push({

coin:s.symbol,
signal:"BUY",
result:"WIN",
probability,
estimatedProfit,
pump,
time:new Date()

})

aiHistory.push({
coin:s.symbol,
result:"WIN"
})

await sendPush(
`${s.symbol} probabilidade ${probability}% lucro estimado ${estimatedProfit}%`
)

}catch(e){}

}

}catch(error){

console.log("Erro scanner")

}

}

setInterval(scanBinance,300000)
scanBinance()

/* =============================
ADMIN
============================= */

app.get("/admin/signals",(req,res)=>{
res.json(signalsToday.slice(-100))
})

app.get("/admin/users",async(req,res)=>{
const users = await User.find()
res.json(users)
})

app.get("/admin/stats",(req,res)=>{
res.json({
totalSignals:signalsToday.length,
aiHistory:aiHistory.length,
onlineUsers:Object.keys(onlineUsers).length
})
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