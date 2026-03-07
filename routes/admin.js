const express = require("express");
const router = express.Router();
const User = require("../models/User");

router.get("/vip-users", async (req,res)=>{

  const users = await User.find({vip:true});

  res.json(users);

});

module.exports=router;