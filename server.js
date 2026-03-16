require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const { MercadoPagoConfig, Payment, Preference } = require("mercadopago");

const app = express();

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
MERCADO PAGO
============================= */

const client = new MercadoPagoConfig({
accessToken:process.env.MP_ACCESS_TOKEN
})

const payment = new Payment(client)
const preference = new Preference(client)

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

if(!email || !password)
return res.status(400).json({error:"Preencha email e senha"})

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

await transporter.sendMail({

from:`"CryptoSignals" <${process.env.EMAIL_USER}>`,
to:email,
subject:"🔐 Recuperação de senha - CryptoSignals",

html:`

<div style="font-family:Arial;background:#0f172a;padding:30px;color:white;text-align:center">

<h2 style="color:#22c55e">🔐 Crypto Signals</h2>

<p style="font-size:18px">Sua nova senha:</p>

<div style="
font-size:28px;
font-weight:bold;
background:#111827;
padding:15px;
border-radius:8px;
display:inline-block;
margin:10px 0;
letter-spacing:2px;
">
${novaSenha}
</div>

<p style="margin-top:15px;color:#d1d5db">
⚠ recomendamos alterar após login
</p>

<hr style="margin:30px 0;border:1px solid #374151">

<h3 style="color:#f59e0b">🚀 QUER SINAIS PREMIUM?</h3>

<p>Entre no VIP agora e receba sinais exclusivos.</p>

<a href="https://backend-vip.onrender.com/vip"
style="
display:inline-block;
margin-top:10px;
padding:14px 24px;
background:#f59e0b;
color:black;
text-decoration:none;
font-weight:bold;
border-radius:8px;
font-size:16px;
">
ENTRAR NO VIP
</a>

</div>

`

})

res.json({message:"Nova senha enviada por e-mail."})

}catch(error){

console.log(error)
res.status(500).json({error:"Erro ao enviar e-mail"})

}

})

/* =============================
LINK VIP
============================= */

app.get("/vip",(req,res)=>{

res.redirect("cryptosignals://vip")

})

/* =============================
LINK DE INDICAÇÃO
============================= */

app.get("/ref/:code",(req,res)=>{

const {code}=req.params

res.redirect(`/signup?ref=${code}`)

})

/* =============================
COMISSÃO AFILIADO
============================= */

app.get("/affiliate/:email",async(req,res)=>{

try{

const {email}=req.params

const user=await User.findOne({email})

if(!user)
return res.status(404).json({error:"Usuário não encontrado"})

res.json({

refCode:user.refCode,

link:`https://backend-vip.onrender.com/ref/${user.refCode}`,

commission:user.commission

})

}catch(e){

res.status(500).json({error:"Erro servidor"})

}

})

/* =============================
PÁGINA DE CADASTRO AFILIADO
============================= */

app.get("/signup",(req,res)=>{

const {ref}=req.query

res.send(`

<html>
<head>
<title>Cadastro CryptoSignals</title>
<style>

body{
font-family:Arial;
background:#0f172a;
color:white;
text-align:center;
padding:40px
}

input{
padding:12px;
margin:10px;
width:250px;
border-radius:6px;
border:none
}

button{
padding:12px 20px;
background:#22c55e;
border:none;
color:white;
font-weight:bold;
border-radius:6px;
cursor:pointer
}

</style>
</head>

<body>

<h1>🚀 Criar Conta</h1>

<form method="POST" action="/register">

<input type="email" name="email" placeholder="Seu email" required><br>

<input type="password" name="password" placeholder="Sua senha" required><br>

<input type="hidden" name="ref" value="${ref || ""}">

<button type="submit">Criar conta</button>

</form>

</body>
</html>

`)

})

/* =============================
SALVAR PIX
============================= */

app.post("/affiliate/pix",async(req,res)=>{

try{

const {email,pixKey}=req.body

const user=await User.findOne({email})

if(!user)
return res.status(404).json({error:"Usuário não encontrado"})

user.pixKey=pixKey

await user.save()

res.json({message:"PIX salvo"})

}catch(e){

res.status(500).json({error:"Erro servidor"})

}

})

/* =============================
TELA AFILIADO COMPLETA
============================= */

app.get("/affiliate/panel/:email",async(req,res)=>{

try{

const {email}=req.params

const user=await User.findOne({email})

if(!user)
return res.status(404).json({error:"Usuário não encontrado"})

const totalRef=await User.countDocuments({
refBy:user.refCode
})

const referrals=await User.find({
refBy:user.refCode
}).select("email vip vipExpires")

/* GANHOS DO MÊS */

const startMonth=new Date()
startMonth.setDate(1)

let ganhosMes=0

for(const r of referrals){

if(r.vip){
ganhosMes += 29.9 * 0.03
}

}

res.json({

saldo:user.commission.toFixed(2),

ganhosMes:ganhosMes.toFixed(2),

codigo:user.refCode,

link:`https://backend-vip.onrender.com/ref/${user.refCode}`,

indicados:totalRef,

lista:referrals

})

}catch(e){

res.status(500).json({error:"Erro servidor"})

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
PIX 30 DIAS
============================= */

app.post("/create-payment",async(req,res)=>{

try{

const {email}=req.body

if(!email)
return res.status(400).json({error:"Email obrigatório"})

const result=await payment.create({

body:{
transaction_amount:29.9,
description:"VIP 30 dias",
payment_method_id:"pix",
payer:{email}
}

})

res.json({

id:result.id,

qrCodeBase64:
result.point_of_interaction?.transaction_data?.qr_code_base64,

pixCode:
result.point_of_interaction?.transaction_data?.qr_code

})

}catch(error){

console.log(error)
res.status(500).json({error:"Erro pagamento PIX"})

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
CHECKOUT PRO CARTÃO
============================= */

app.post("/create-checkout",async(req,res)=>{

try{

const {email}=req.body

const result=await preference.create({

body:{

items:[{

title:"VIP 30 dias",
quantity:1,
currency_id:"BRL",
unit_price:29.9

}],

payer:{email},

back_urls:{

success:"https://backend-vip.onrender.com/success",
failure:"https://backend-vip.onrender.com/failure",
pending:"https://backend-vip.onrender.com/pending"

},

auto_return:"approved",

notification_url:
"https://backend-vip.onrender.com/webhook"

}

})

res.json({init_point:result.init_point})

}catch(error){

console.log(error)
res.status(500).json({error:"Erro ao criar checkout"})

}

})

/* =============================
WEBHOOK
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
CHECK VIP
============================= */

app.get("/check-vip/:email",async(req,res)=>{

const email=req.params.email.toLowerCase().trim()

const user=await User.findOne({email})

if(!user)
return res.json({vip:false})

if(user.vip && user.vipExpires){

if(new Date()>user.vipExpires){

user.vip=false
user.vipExpires=null
await user.save()

}

}

res.json({

vip:user.vip,
expires:user.vipExpires

})

})

/* =============================
ATIVAR VIP
============================= */

async function activateVip(email){

email=email.toLowerCase().trim()

const user=await User.findOne({email})

if(!user) return

user.vip=true

const expiration=new Date()

expiration.setDate(expiration.getDate()+30)

user.vipExpires=expiration

await user.save()

}

/* =============================
ROOT
============================= */

app.get("/",(req,res)=>{

res.send("Backend VIP funcionando 🚀")

})

app.listen(PORT,()=>{

console.log("Servidor rodando na porta",PORT)

})

