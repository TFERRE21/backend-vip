require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

/* =========================
   CONEXÃO MONGO
========================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🔥 MongoDB conectado"))
  .catch(err => console.error("Erro Mongo:", err));

/* =========================
   MODEL USUÁRIO
========================= */

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  vip: {
    type: Boolean,
    default: false
  },
  vip_expira_em: Date
});

const User = mongoose.model("User", userSchema);

/* =========================
   ROTA TESTE
========================= */

app.get("/", (req, res) => {
  res.send("Backend VIP funcionando 🚀");
});

/* =========================
   CRIAR ASSINATURA MENSAL
========================= */

app.post("/criar-assinatura", async (req, res) => {
  try {
    const { email } = req.body;

    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        reason: "VIP Mensal",
        external_reference: email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: 97,
          currency_id: "BRL",
        },
        back_url: "https://backend-vip.onrender.com",
        status: "pending",
      }),
    });

    const data = await response.json();

    res.json({
      link_assinatura: data.init_point,
    });

  } catch (error) {
    console.error("Erro ao criar assinatura:", error);
    res.status(500).json({ erro: "Erro ao criar assinatura" });
  }
});

/* =========================
   WEBHOOK MERCADO PAGO
========================= */

app.post("/webhook", async (req, res) => {

  try {

    if (req.body.type === "preapproval") {

      const subscriptionId = req.body.data.id;

      const response = await fetch(
        `https://api.mercadopago.com/preapproval/${subscriptionId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );

      const subscription = await response.json();

      const email = subscription.external_reference;

      if (subscription.status === "authorized") {

        const dataExpiracao = new Date();
        dataExpiracao.setMonth(dataExpiracao.getMonth() + 1);

        await User.findOneAndUpdate(
          { email },
          {
            vip: true,
            vip_expira_em: dataExpiracao
          },
          { upsert: true }
        );

        console.log("✅ VIP ativado para:", email);
      }

      if (subscription.status === "cancelled") {

        await User.findOneAndUpdate(
          { email },
          { vip: false }
        );

        console.log("❌ VIP cancelado:", email);
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("Erro webhook:", error);
    res.sendStatus(500);
  }
});

/* =========================
   INICIAR SERVIDOR
========================= */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});