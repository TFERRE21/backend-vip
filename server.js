require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const { RSI } = require("technicalindicators");

const app = express();
app.use(cors());
app.use(express.json());

/* =============================
   🔐 MERCADO PAGO CONFIG
============================= */

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const payment = new Payment(client);

/* =============================
   💾 VIP PERSISTENTE (ARQUIVO)
============================= */

const VIP_FILE = "vipUsers.json";

function loadVipUsers() {
  if (!fs.existsSync(VIP_FILE)) {
    fs.writeFileSync(VIP_FILE, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(VIP_FILE));
}

function saveVipUsers(users) {
  fs.writeFileSync(VIP_FILE, JSON.stringify(users, null, 2));
}

let vipUsers = loadVipUsers();

/* =============================
   📊 SINAIS
============================= */

let freeSignals = [];
let vipSignals = [];

const BINANCE_BASE = "https://api.binance.com";

function calculateRSI(closes) {
  return RSI.calculate({
    values: closes,
    period: 14,
  });
}

function generateSignal(symbol, price, rsi) {
  let signal = "NEUTRO";
  let trend = "LATERAL";

  if (rsi < 30) {
    signal = "COMPRA";
    trend = "ALTA";
  } else if (rsi > 70) {
    signal = "VENDA";
    trend = "BAIXA";
  }

  return {
    symbol,
    price,
    rsi: rsi.toFixed(2),
    signal,
    trend,
    entryTime: "Próxima vela 15m",
    possibleGain: `${(Math.random() * 5 + 1).toFixed(2)}%`,
  };
}

async function updateSignals() {
  try {
    const exchangeInfo = await axios.get(
      `${BINANCE_BASE}/api/v3/exchangeInfo`
    );

    const usdtPairs = exchangeInfo.data.symbols
      .filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING")
      .slice(0, 200);

    let signals = [];

    for (let pair of usdtPairs) {
      try {
        const klines = await axios.get(
          `${BINANCE_BASE}/api/v3/klines`,
          {
            params: {
              symbol: pair.symbol,
              interval: "15m",
              limit: 100,
            },
          }
        );

        const closes = klines.data.map((k) => parseFloat(k[4]));
        const rsiValues = calculateRSI(closes);

        if (rsiValues.length > 0) {
          const lastRSI = rsiValues[rsiValues.length - 1];
          const price = closes[closes.length - 1];

          signals.push(generateSignal(pair.symbol, price, lastRSI));
        }
      } catch {}
    }

    signals.sort((a, b) => parseFloat(a.rsi) - parseFloat(b.rsi));

    freeSignals = signals.slice(0, 10);
    vipSignals = signals.slice(0, 150);

    console.log("Sinais atualizados!");
  } catch (error) {
    console.log("Erro sinais:", error.message);
  }
}

updateSignals();
setInterval(updateSignals, 5 * 60 * 1000);

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
        payer: {
          email: email,
        },
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
    console.log("Erro MP:", error);
    res.status(500).json({ error: "Erro ao criar pagamento" });
  }
});

/* =============================
   🔍 VERIFICAR PAGAMENTO
============================= */

app.get("/check-payment/:id/:email", async (req, res) => {
  try {
    const { id, email } = req.params;

    const result = await payment.get({ id });

    if (result.status === "approved") {
      if (!vipUsers.includes(email)) {
        vipUsers.push(email);
        saveVipUsers(vipUsers);
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
  const { email } = req.params;
  res.json({ vip: vipUsers.includes(email) });
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
   🚀 SERVER RENDER
============================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () =>
  console.log("Servidor rodando na porta " + PORT)
);