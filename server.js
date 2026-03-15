require("dotenv").config()

const express = require("express")
const cors = require("cors")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const nodemailer = require("nodemailer")
const mongoose = require("mongoose")
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

const expiration = new Date()

expiration.setDate(expiration.getDate() + 30)

user.vip = true
user.vipExpires = expiration

await user.save()

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
RECUPERAR SENHA
============================= */

app.post("/forgot-password",async(req,res)=>{

try{

let {email}=req.body

email=email.toLowerCase().trim()

const user=await User.findOne({email})

if(!user)
return res.status(404).json({error:"Usuário não encontrado"})

const novaSenha=Math.random().toString(36).slice(-8)

user.password=await bcrypt.hash(novaSenha,8)

await user.save()

const transporter=nodemailer.createTransport({

service:"gmail",

auth:{
user:process.env.EMAIL_USER,
pass:process.env.EMAIL_PASS
}

})

await transporter.sendMail({

from:`"CryptoSignals" <${process.env.EMAIL_USER}>`,
to:email,
subject:"Nova senha",
html:`<h2>Sua nova senha:</h2><h1>${novaSenha}</h1>`

})

res.json({message:"Nova senha enviada por e-mail."})

}catch(error){

console.log(error)
res.status(500).json({error:"Erro ao enviar e-mail"})

}

})

/* =============================
ALTERAR SENHA
============================= */

app.post("/change-password",async(req,res)=>{

try{

let {email,oldPassword,newPassword}=req.body

email=email.toLowerCase().trim()

const user=await User.findOne({email})

if(!user)
return res.status(404).json({error:"Usuário não encontrado"})

const valid=await bcrypt.compare(oldPassword,user.password)

if(!valid)
return res.status(400).json({error:"Senha atual incorreta"})

user.password=await bcrypt.hash(newPassword,8)

await user.save()

res.json({message:"Senha alterada com sucesso"})

}catch(error){

console.log(error)
res.status(500).json({error:"Erro ao alterar senha"})

}

})

/* =============================
CRIAR CHECKOUT CARTÃO
============================= */

app.post("/create-checkout", async (req,res)=>{

try{

const {email} = req.body

if(!email)
return res.status(400).json({error:"Email obrigatório"})

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

payer:{
email
},

auto_return:"approved"

}

})

res.json({

init_point: result.init_point

})

}catch(error){

console.log("Erro criar checkout:",error)

res.status(500).json({
error:"Erro criar checkout"
})

}

})

/* =============================
VERIFICAR VIP
============================= */

app.get("/check-vip/:email",async(req,res)=>{

const {email}=req.params

const user=await User.findOne({email})

if(!user)
return res.json({vip:false})

res.json({

vip:user.vip,
vipExpires:user.vipExpires

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