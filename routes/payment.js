const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.post("/activate-vip", async (req,res)=>{

  const {email}=req.body;

  const user=await User.findOne({email});

  if(!user)
    return res.status(404).json({error:"Usuário não encontrado"});

  const expiration=new Date();

  expiration.setDate(expiration.getDate()+30);

  user.vip=true;
  user.vipExpires=expiration;

  await user.save();

  res.json({message:"VIP ativado"});

});

module.exports=router;