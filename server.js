require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 10000;

/* ================================
   CONEXÃO MONGODB
================================ */

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("🔥 MongoDB conectado"))
  .catch((err) => console.log("Erro Mongo:", err));

/* ================================
   MODELO USUÁRIO
================================ */

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  vip: { type: Boolean, default: false },
});

const User = mongoose.model("User", userSchema);

/* ================================
   ROTA RAIZ
================================ */

app.get("/", (req, res) => {
  res.send("Backend VIP funcionando 🚀");
});

/* ================================
   REGISTER
================================ */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "Email já cadastrado" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      vip: false,
    });

    res.json({ message: "Usuário criado com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================
   LOGIN
================================ */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Usuário não encontrado" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Senha inválida" });

    const token = jwt.sign(
      { id: user._id, vip: user.vip },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================================
   MIDDLEWARE PROTEGIDO
================================ */

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).json({ message: "Token não fornecido" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido" });
  }
}

/* ================================
   ROTA PROTEGIDA VIP
================================ */

app.get("/api/vip-content", authMiddleware, (req, res) => {
  if (!req.user.vip)
    return res.status(403).json({ message: "Acesso apenas para VIP" });

  res.json({ message: "Conteúdo VIP liberado 👑📊" });
});

/* ================================
   START SERVER
================================ */

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});