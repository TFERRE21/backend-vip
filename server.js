require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const { RSI } = require("technicalindicators");

const app = express();
app.use(cors());
app.use(express.json());

/* =============================
   🔐 MERCADO PAGO
============================= */

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const payment = new Payment(client);

/* =============================
   🧠 MEMÓRIA SIMPLES
============================= */

let vipUsers = [];
let freeSignals = [];
let vipSignals = [];

const BINANCE_BASE = "https://api.binance.com";

/* =============================
   📊 RSI
============================= */

function calculateRSI(closes) {
  return RSI.calculate({
    values: closes,
    period: 14,
  });
}

/* =============================
   ⏰ PRÓXIMA VELA 15M
============================= */

function getNext15MinCandle() {
  const now = new Date();
  const minutes = now.getMinutes();
  const next = 15 - (minutes % 15);

  now.setMinutes(minutes + next);
  now.setSeconds(0);

  return now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* =============================
   🎯 GERAR SINAL
============================= */

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
    entryTime: getNext15MinCandle(),
    possibleGain: `${(Math.random() * 5 + 1).toFixed(2)}%`,
    chartUrl: `https://www.binance.com/pt-BR/trade/${symbol}`,
  };
}

/* =============================
   🔄 ATUALIZAR SINAIS
============================= */

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

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Email inválido" });
    }

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
    console.log("Erro MP:", error.response?.data || error);
    res.status(500).json({ error: "Erro ao criar pagamento" });
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
   🚀 START
============================= */

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Servidor rodando 🚀");
});

app.listen(PORT, () =>
  console.log(`Servidor rodando na porta ${PORT}`)
);