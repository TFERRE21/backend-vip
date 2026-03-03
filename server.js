require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = "supersecret123";

/* =============================
   🧠 BANCO EM MEMÓRIA
============================= */

let users = [];
let vipUsers = [];

/* =============================
   🔐 MERCADO PAGO
============================= */

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const payment = new Payment(client);

/* =============================
   👤 REGISTER
============================= */

app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Preencha tudo" });

  const exists = users.find((u) => u.email === email);
  if (exists)
    return res.status(400).json({ error: "Usuário já existe" });

  const hashed = await bcrypt.hash(password, 8);

  users.push({
    email,
    password: hashed,
  });

  res.json({ message: "Conta criada" });
});

/* =============================
   🔐 LOGIN
============================= */

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user)
    return res.status(400).json({ error: "Email inválido" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid)
    return res.status(400).json({ error: "Senha inválida" });

  const token = jwt.sign({ email }, JWT_SECRET);

  res.json({ token });
});

/* =============================
   🔐 RECUPERAR SENHA REAL
============================= */

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ error: "Email obrigatório" });

    const user = users.find((u) => u.email === email);

    if (!user)
      return res.status(404).json({ error: "Usuário não encontrado" });

    // 🔥 Nova senha
    const novaSenha = Math.random().toString(36).slice(-8);

    const hashed = await bcrypt.hash(novaSenha, 8);
    user.password = hashed;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"CryptoSignals" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Nova senha - CryptoSignals",
      html: `
        <h2>Recuperação de senha</h2>
        <p>Sua nova senha é:</p>
        <h1>${novaSenha}</h1>
        <p>Faça login e altere depois.</p>
      `,
    });

    res.json({ message: "Nova senha enviada para o e-mail." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao enviar e-mail" });
  }
});

/* =============================
   💳 CRIAR PAGAMENTO PIX
============================= */

app.post("/create-payment", async (req, res) => {
  try {
    const { email } = req.body;

    const result = await payment.create({
      body: {
        transaction_amount: 29.9,
        description: "Acesso VIP",
        payment_method_id: "pix",
        payer: { email },
      },
    });

    res.json({
      id: result.id,
      qrCodeBase64:
        result.point_of_interaction.transaction_data.qr_code_base64,
      pixCode:
        result.point_of_interaction.transaction_data.qr_code,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro pagamento" });
  }
});

/* =============================
   🔍 CHECK PAYMENT
============================= */

app.get("/check-payment/:id/:email", async (req, res) => {
  try {
    const { id, email } = req.params;

    const result = await payment.get({ id });

    if (result.status === "approved") {
      if (!vipUsers.includes(email)) {
        vipUsers.push(email);
      }
    }

    res.json({ status: result.status });
  } catch {
    res.status(500).json({ error: "Erro verificar" });
  }
});

/* =============================
   👑 CHECK VIP
============================= */

app.get("/check-vip/:email", (req, res) => {
  res.json({ vip: vipUsers.includes(req.params.email) });
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});