// routes/authRoutes.js
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Login + session
router.post("/login", authController.login);
router.get("/check-session", authController.checkSession);
router.post("/logout", authController.logout);

// Forgot-password flow
router.post("/forgot", authController.forgotPassword);
router.post("/verify-code", authController.verifyCode);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
