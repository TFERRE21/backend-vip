require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

/* ===========================
   🔥 CONEXÃO MONGO
=========================== */

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("🔥 MongoDB conectado"))
.catch(err => console.log("Erro Mongo:", err));

/* ===========================
   👤 MODEL USER
=========================== */

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  isVip: { type: Boolean, default: false }
});

const User = mongoose.model("User", UserSchema);

/* ===========================
   🔐 REGISTRO
=========================== */

app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ error: "Usuário já existe" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hashedPassword
    });

    res.json({ message: "Usuário criado com sucesso" });

  } catch (err) {
    res.status(500).json({ error: "Erro ao registrar" });
  }
});

/* ===========================
   🔑 LOGIN
=========================== */

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Usuário não encontrado." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(400).json({ error: "Senha inválida." });

    const token = jwt.sign(
      { id: user._id, isVip: user.isVip },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (err) {
    res.status(500).json({ error: "Erro no login" });
  }
});

/* ===========================
   🔐 RECUPERAR SENHA
=========================== */

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ error: "Usuário não encontrado" });

    const newPassword = Math.random().toString(36).slice(-8);
    const hashed = await bcrypt.hash(newPassword, 10);

    user.password = hashed;
    await user.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Nova senha - CryptoSignals",
      text: `Sua nova senha é: ${newPassword}`
    });

    res.json({ message: "Nova senha enviada para o e-mail" });

  } catch (err) {
    res.status(500).json({ error: "Erro ao enviar e-mail" });
  }
});

/* ===========================
   👑 ATIVAR VIP (PIX)
=========================== */

app.post("/activate-vip", async (req, res) => {
  try {
    const { userId } = req.body;

    await User.findByIdAndUpdate(userId, { isVip: true });

    res.json({ message: "VIP ativado" });

  } catch (err) {
    res.status(500).json({ error: "Erro ao ativar VIP" });
  }
});

/* ===========================
   🚀 START SERVER
=========================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});