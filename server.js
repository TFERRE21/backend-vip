require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

/* ================================
   🔒 RATE LIMIT (ANTI BRUTE FORCE)
================================ */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Muitas solicitações. Aguarde 15 minutos." },
});

/* ================================
   🔑 EMAIL CONFIG
================================ */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================================
   🧠 BANCO SIMPLES EM MEMÓRIA
================================ */

let users = [];

/* ================================
   🔐 MIDDLEWARE AUTH
================================ */

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).json({ error: "Token não fornecido" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "supersecret");
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

/* ================================
   👤 REGISTER
================================ */

app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (users.find((u) => u.email === email))
    return res.status(400).json({ error: "Usuário já existe" });

  const hashedPassword = await bcrypt.hash(password, 10);

  users.push({
    email,
    password: hashedPassword,
    isVip: false,
  });

  res.json({ message: "Usuário criado com sucesso" });
});

/* ================================
   🔐 LOGIN
================================ */

app.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user)
    return res.status(400).json({ error: "Usuário não encontrado" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid)
    return res.status(400).json({ error: "Senha incorreta" });

  const token = jwt.sign(
    { email: user.email },
    process.env.JWT_SECRET || "supersecret",
    { expiresIn: "7d" }
  );

  res.json({ token });
});

/* ================================
   🔄 FORGOT PASSWORD
================================ */

app.post("/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = req.body;

  const user = users.find((u) => u.email === email);
  if (!user)
    return res.status(400).json({ error: "Usuário não encontrado" });

  const newPassword = Math.random().toString(36).slice(-8);
  user.password = await bcrypt.hash(newPassword, 10);

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Nova senha - CryptoSignals",
    text: `Sua nova senha é: ${newPassword}`,
  });

  res.json({ message: "Nova senha enviada para o e-mail" });
});

/* ================================
   🚀 START
================================ */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor rodando na porta", PORT));