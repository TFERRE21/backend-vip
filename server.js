require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
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
let freeSignals = [];
let vipSignals = [];
let paymentEmails = {}; // salva email por paymentId

/* =============================
   💳 MERCADO PAGO CONFIG
============================= */

if (!process.env.MP_ACCESS_TOKEN) {
  console.log("⚠️ MP_ACCESS_TOKEN NÃO DEFINIDO!");
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const payment = new Payment(client);

/* =============================
   📊 GERAR SINAIS
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

async function updateSignals() {
  try {
    const response = await axios.get(
      "https://api.binance.com/api/v3/ticker/price"
    );

    const pairs = response.data
      .filter((c) => c.symbol.endsWith("USDT"))
      .slice(0, 150);

    const signals = pairs.map((pair) =>
      generateSignal(pair.symbol, parseFloat(pair.price))
    );

    freeSignals = signals.slice(0, 10);
    vipSignals = signals;

    console.log("✅ Sinais atualizados");
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
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Preencha email e senha" });
    }

    const exists = users.find((u) => u.email === email);
    if (exists) {
      return res.status(400).json({ error: "Usuário já existe" });
    }

    const hashed = await bcrypt.hash(password, 8);
    users.push({ email, password: hashed });

    res.json({ message: "Conta criada com sucesso" });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =============================
   🔐 LOGIN
============================= */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Preencha tudo" });
    }

    const user = users.find((u) => u.email === email);
    if (!user) {
      return res.status(400).json({ error: "Email inválido" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Senha inválida" });
    }

    const token = jwt.sign({ email }, JWT_SECRET);
    res.json({ token });
  } catch {
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =============================
   💳 CREATE PAYMENT PIX
============================= */

app.post("/create-payment", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "Email obrigatório" });
    }

    const result = await payment.create({
      body: {
        transaction_amount: 29.9,
        description: "Acesso VIP CryptoSignals",
        payment_method_id: "pix",
        payer: { email },
      },
    });

    paymentEmails[result.id] = email;

    res.json({
      id: result.id,
      qrCodeBase64:
        result.point_of_interaction.transaction_data.qr_code_base64,
      pixCode:
        result.point_of_interaction.transaction_data.qr_code,
    });
  } catch (error) {
    console.log("ERRO PAGAMENTO:", error);
    res.status(500).json({
      error: "Erro pagamento",
      details: error.message,
    });
  }
});

/* =============================
   🔔 WEBHOOK AUTOMÁTICO
============================= */

app.post("/webhook", async (req, res) => {
  try {
    if (req.body.type === "payment") {
      const paymentId = req.body.data.id;

      const result = await payment.get({ id: paymentId });

      if (result.status === "approved") {
        const email = paymentEmails[paymentId];

        if (email && !vipUsers.includes(email)) {
          vipUsers.push(email);
          console.log("✅ VIP liberado automaticamente:", email);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.log("Erro webhook:", error.message);
    res.sendStatus(500);
  }
});

/* =============================
   🔍 CHECK PAYMENT (MANUAL)
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
  } catch (error) {
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
   ROOT
============================= */

app.get("/", (req, res) => {
  res.send("Backend rodando 🚀");
});

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});