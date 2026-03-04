require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();

/* =============================
   🔥 REMOVE BARRA FINAL AUTOMÁTICO
============================= */
app.use((req, res, next) => {
  if (req.url.length > 1 && req.url.endsWith("/")) {
    req.url = req.url.slice(0, -1);
  }
  next();
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret123";

/* =============================
   🧠 BANCO EM MEMÓRIA
============================= */

let users = [];

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
  try {
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
      vip: false,
      vipExpires: null,
    });

    res.json({ message: "Conta criada" });
  } catch {
    res.status(500).json({ error: "Erro ao registrar" });
  }
});

/* =============================
   🔐 LOGIN
============================= */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find((u) => u.email === email);
    if (!user)
      return res.status(400).json({ error: "Email inválido" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ error: "Senha inválida" });

    const token = jwt.sign({ email }, JWT_SECRET);

    res.json({ token });
  } catch {
    res.status(500).json({ error: "Erro no login" });
  }
});

/* =============================
   🔐 RECUPERAR SENHA
============================= */

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = users.find((u) => u.email === email);
    if (!user)
      return res.status(404).json({ error: "Usuário não encontrado" });

    const novaSenha = Math.random().toString(36).slice(-8);
    user.password = await bcrypt.hash(novaSenha, 8);

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
      subject: "Nova senha",
      html: `<h2>Sua nova senha:</h2><h1>${novaSenha}</h1>`,
    });

    res.json({ message: "Nova senha enviada." });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao enviar e-mail" });
  }
});

/* =============================
   💳 CRIAR PAGAMENTO PIX + CARTÃO
============================= */

app.post("/create-payment", async (req, res) => {
  try {
    const { email, method, token, installments } = req.body;

    const user = users.find((u) => u.email === email);
    if (!user)
      return res.status(400).json({ error: "Usuário não encontrado" });

    let body = {
      transaction_amount: 29.9,
      description: "VIP 30 dias",
      payer: { email },
    };

    if (method === "pix") {
      body.payment_method_id = "pix";
    }

    if (method === "card") {
      body.token = token;
      body.installments = installments || 1;
      body.payment_method_id = "visa";
    }

    const result = await payment.create({ body });

    if (method === "card" && result.status === "approved") {
      user.vip = true;
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + 30);
      user.vipExpires = expiration;
    }

    if (method === "pix") {
      return res.json({
        id: result.id,
        qrCodeBase64:
          result.point_of_interaction.transaction_data.qr_code_base64,
        pixCode:
          result.point_of_interaction.transaction_data.qr_code,
      });
    }

    res.json({ status: result.status });

  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro pagamento" });
  }
});

/* =============================
   🔍 CHECK PIX + ATIVAR VIP
============================= */

app.get("/check-payment/:id/:email", async (req, res) => {
  try {
    const { id, email } = req.params;

    const result = await payment.get({ id });
    const user = users.find((u) => u.email === email);

    if (result.status === "approved" && user) {
      user.vip = true;
      const expiration = new Date();
      expiration.setDate(expiration.getDate() + 30);
      user.vipExpires = expiration;
    }

    res.json({ status: result.status });

  } catch {
    res.status(500).json({ error: "Erro verificar" });
  }
});

/* =============================
   👑 CHECK VIP + EXPIRAÇÃO
============================= */

app.get("/check-vip/:email", (req, res) => {
  const user = users.find((u) => u.email === req.params.email);

  if (!user) return res.json({ vip: false });

  if (user.vip && user.vipExpires) {
    if (new Date() > user.vipExpires) {
      user.vip = false;
      user.vipExpires = null;
    }
  }

  res.json({
    vip: user.vip,
    expires: user.vipExpires,
  });
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});