const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const User = require("../models/User");

/* REGISTER */

router.post("/register", async (req,res)=>{

  const {email,password}=req.body;

  const userExists=await User.findOne({email});

  if(userExists)
    return res.status(400).json({error:"Usuário existe"});

  const hashed=await bcrypt.hash(password,10);

  const user=await User.create({

    email,
    password:hashed

  });

  res.json({message:"Conta criada"});

});

/* LOGIN */

router.post("/login", async (req,res)=>{

  const {email,password}=req.body;

  const user=await User.findOne({email});

  if(!user)
    return res.status(400).json({error:"Email inválido"});

  const valid=await bcrypt.compare(password,user.password);

  if(!valid)
    return res.status(400).json({error:"Senha inválida"});

  const token=jwt.sign({id:user._id},process.env.JWT_SECRET);

  res.json({token});

});

/* RECUPERAR SENHA */

router.post("/forgot-password", async (req,res)=>{

  const {email}=req.body;

  const user=await User.findOne({email});

  if(!user)
    return res.status(404).json({error:"Usuário não encontrado"});

  const token=crypto.randomBytes(32).toString("hex");

  user.resetToken=token;
  user.resetExpires=Date.now()+3600000;

  await user.save();

  const link=`https://backend-vip.onrender.com/reset/${token}`;

  const transporter=nodemailer.createTransport({

    service:"gmail",
    auth:{
      user:process.env.EMAIL_USER,
      pass:process.env.EMAIL_PASS
    }

  });

  await transporter.sendMail({

    from:process.env.EMAIL_USER,
    to:email,
    subject:"Recuperar senha",
    html:`Clique no link para redefinir senha <a href="${link}">Resetar</a>`

  });

  res.json({message:"Email enviado"});

});

/* RESET SENHA */

router.post("/reset/:token", async (req,res)=>{

  const user=await User.findOne({

    resetToken:req.params.token,
    resetExpires:{$gt:Date.now()}

  });

  if(!user)
    return res.status(400).json({error:"Token inválido"});

  const hashed=await bcrypt.hash(req.body.password,10);

  user.password=hashed;
  user.resetToken=null;
  user.resetExpires=null;

  await user.save();

  res.json({message:"Senha alterada"});

});

module.exports=router;