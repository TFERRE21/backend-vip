const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({

  email: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true
  },

  vip: {
    type: Boolean,
    default: false
  },

  vipExpires: {
    type: Date,
    default: null
  },

  resetToken: String,
  resetExpires: Date,

  createdAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("User", UserSchema);