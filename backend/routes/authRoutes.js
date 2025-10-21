// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/login", authController.login);
router.post("/forgot", authController.forgotPassword);
router.post("/verify-code", authController.verifyCode);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
