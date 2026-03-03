require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const { RSI } = require("technicalindicators");

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
let freeSignals = [];
let vipSignals = [];

/* =============================
   💳 MERCADO PAGO CONFIG
============================= */

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const payment = new Payment(client);

/* =============================
   📊 FUNÇÕES RSI
============================= */

function generateSignal(symbol, price) {
  const fakeRSI = Math.random() * 100;

  let signal = "NEUTRO";
  let trend = "LATERAL";

  if (fakeRSI < 30) {
    signal = "COMPRA";
    trend = "ALTA";
  } else if (fakeRSI > 70) {
    signal = "VENDA";
    trend = "BAIXA";
  }

  return {
    symbol,
    price,
    rsi: fakeRSI.toFixed(2),
    signal,
    trend,
    entryTime: new Date().toLocaleTimeString(),
    possibleGain: `${(Math.random() * 5 + 1).toFixed(2)}%`,
  };
}

/* =============================
   🔄 ATUALIZA SINAIS
============================= */

async function updateSignals() {
  try {
    const response = await axios.get(
      "https://api.binance.com/api/v3/ticker/price"
    );

    const pairs = response.data
      .filter((c) => c.symbol.endsWith("USDT"))
      .slice(0, 150);

    let signals = [];

    for (let pair of pairs) {
      const price = parseFloat(pair.price);
      signals.push(generateSignal(pair.symbol, price));
    }

    freeSignals = signals.slice(0, 10);
    vipSignals = signals.slice(0, 150);

    console.log("Sinais atualizados");
  } catch (err) {
    console.log("Erro Binance:", err.message);
  }
}

updateSignals();
setInterval(updateSignals, 5 * 60 * 1000);

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
   🔄 RECUPERAR SENHA
============================= */

app.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user)
    return res.status(400).json({ error: "Email não encontrado" });

  res.json({ message: "Simulação de recuperação enviada" });
});

/* =============================
   💳 CRIAR PAGAMENTO PIX
============================= */

app.post("/create-payment", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email obrigatório" });
    }

    const result = await payment.create({
      body: {
        transaction_amount: 29.9,
        description: "Acesso VIP CryptoSignals",
        payment_method_id: "pix",
        payer: {
          email: email,
        },
      },
    });

    const data = result.response;

    res.json({
      id: data.id,
      qrCodeBase64:
        data.point_of_interaction.transaction_data.qr_code_base64,
      pixCode:
        data.point_of_interaction.transaction_data.qr_code,
    });

  } catch (error) {
    console.log("ERRO MERCADO PAGO:", error);
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
    const data = result.response;

    if (data.status === "approved") {
      if (!vipUsers.includes(email)) {
        vipUsers.push(email);
      }
    }

    res.json({ status: data.status });

  } catch (error) {
    console.log("Erro check:", error);
    res.status(500).json({ error: "Erro verificar pagamento" });
  }
});

/* =============================
   👑 CHECK VIP
============================= */

app.get("/check-vip/:email", (req, res) => {
  res.json({ vip: vipUsers.includes(req.params.email) });
});

/* =============================
   📡 SINAIS
============================= */

app.get("/signals/free", (req, res) => {
  res.json(freeSignals);
});

app.get("/signals/vip", (req, res) => {
  res.json(vipSignals);
});

/* =============================
   🚀 START SERVER
============================= */

app.get("/", (req, res) => {
  res.send("Backend rodando 🚀");
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});