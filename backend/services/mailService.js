// services/mailService.js
// email service for sending password reset codes
const nodemailer = require("nodemailer");

class MailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, 
      },
      tls: { rejectUnauthorized: false },
    });
  }

  async sendResetCode(email, code) {
    const mailOptions = {
      from: "salesforecastingbcf@gmail.com",
      to: email,
      subject: "Password Reset Code",
      html: `
        <html>
          <body style="font-family: Arial; background:#f4f4f4; margin:0; padding:0;">
            <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 8px rgba(0,0,0,0.05);">
              <div style="background:#0A4174;color:#fff;padding:20px;text-align:center;">
                <h2>Password Reset Request</h2>
              </div>
              <div style="padding:30px;color:#333;">
                <p>Dear Customer,</p>
                <p>You recently requested a password reset for your account. To proceed, please use the following One-Time Password (OTP) code:</p>
                <div style="background:#f8f9fa;border:1px solid #e9ecef;border-radius:4px;padding:15px;text-align:center;font-size:24px;font-weight:bold;margin:20px 0;color:#007bff;">
                  ${code}
                </div>
                <p>This code is only valid for <strong>2 minutes</strong>. For security, please do not share this code with anyone. If you did not request this reset, you can safely ignore this email.</p>
              </div>
              <div style="background:#e9ecef;color:#6c757d;padding:15px;font-size:12px;text-align:center;border-top:1px solid #dee2e6;">
                &copy; ${new Date().getFullYear()} Sales Forecasting. All rights reserved.
              </div>
            </div>
          </body>
        </html>
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log("✅ OTP sent:", info.response);
      return true;
    } catch (error) {
      console.error("Email error:", error.response || error);
      return false;
    }
  }
}

module.exports = new MailService();
