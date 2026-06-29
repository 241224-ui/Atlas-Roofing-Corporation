import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Route: Check configuration status
  app.get("/api/config-status", (req, res) => {
    const hasSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    const hasResend = !!process.env.RESEND_API_KEY;
    const hasSendGrid = !!process.env.SENDGRID_API_KEY;

    res.json({
      configured: hasSmtp || hasResend || hasSendGrid,
      provider: hasResend ? "Resend" : hasSendGrid ? "SendGrid" : hasSmtp ? "SMTP" : "None (Simulated)",
      adminEmail: process.env.ADMIN_RECEIVER_EMAIL || "info@atlasroofing.com",
    });
  });

  // API Route: Contact Inquiry Form Handler
  app.post("/api/contact", async (req, res) => {
    try {
      const { name, company, email, phone, subject, message } = req.body;

      // Validation
      if (!name || !email || !subject || !message) {
        return res.status(400).json({
          success: false,
          error: "Please fill in all required fields (Name, Email, Subject, Message).",
        });
      }

      // Email format check
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Please provide a valid email address.",
        });
      }

      console.log("-----------------------------------------");
      console.log(`[INQUIRY RECEIVED] From: ${name} (${email})`);
      console.log(`Company: ${company || "N/A"} | Phone: ${phone || "N/A"}`);
      console.log(`Subject: ${subject}`);
      console.log(`Message: ${message}`);
      console.log("-----------------------------------------");

      // Environment integrations checking
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const adminEmail = process.env.ADMIN_RECEIVER_EMAIL || "info@atlasroofing.com";

      let emailSent = false;
      let integrationDetails = "Simulation Mode (No environment variables set)";

      // Nodemailer implementation path
      if (smtpHost && smtpUser && smtpPass) {
        try {
          // Dynamic import of nodemailer to prevent issues if not installed or used
          const nodemailer = await import("nodemailer");
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === "true",
            auth: {
              user: smtpUser,
              pass: smtpPass,
            },
          });

          // 1. Admin notification email
          await transporter.sendMail({
            from: `"Atlas Inquiry System" <${smtpUser}>`,
            to: adminEmail,
            subject: `[New Website Lead] - ${subject}`,
            html: `
              <h2>New Inquiry from Atlas Roofing Website</h2>
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Company:</strong> ${company || "Not provided"}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
              <p><strong>Subject:</strong> ${subject}</p>
              <p><strong>Message:</strong></p>
              <blockquote style="background: #f5f5f5; padding: 12px; border-left: 4px solid #F47A20;">
                ${message.replace(/\n/g, "<br>")}
              </blockquote>
            `,
          });

          // 2. Auto-reply confirmation to client
          await transporter.sendMail({
            from: `"Atlas Roofing Corporation" <${smtpUser}>`,
            to: email,
            subject: `Thank you for contacting Atlas Roofing Corporation`,
            html: `
              <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border-top: 5px solid #0B3C5D; padding-top: 20px;">
                <h2 style="color: #0B3C5D;">We have received your inquiry!</h2>
                <p>Hello ${name},</p>
                <p>Thank you for reaching out to Atlas Roofing Corporation. A representative from our Northglenn, Colorado manufacturing facility will review your message and contact you within 1 business day.</p>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0;">
                  <h4 style="margin-top: 0; color: #333;">Summary of your request:</h4>
                  <p><strong>Subject:</strong> ${subject}</p>
                  <p><strong>Message:</strong> ${message}</p>
                </div>
                <p style="font-size: 13px; color: #666;">
                  <strong>Atlas Roofing Corporation</strong><br>
                  11020 Leroy Dr, Northglenn, CO 80233<br>
                  Phone: +1 303-252-0300 | Hours: Monday–Friday, 8:00 AM – 5:00 PM
                </p>
              </div>
            `,
          });

          emailSent = true;
          integrationDetails = "Sent via Nodemailer SMTP";
        } catch (mailError: any) {
          console.error("Nodemailer SMTP sending failed:", mailError.message);
          integrationDetails = `SMTP Fail: ${mailError.message}`;
        }
      }

      // Check for Resend configuration
      const resendApiKey = process.env.RESEND_API_KEY;
      if (!emailSent && resendApiKey) {
        try {
          // Dynamic import of resend to avoid dependency crashing
          const { Resend } = await import("resend");
          const resend = new Resend(resendApiKey);

          // Admin notice
          await resend.emails.send({
            from: "Atlas Website <onboarding@resend.dev>",
            to: adminEmail,
            subject: `[New Website Lead] - ${subject}`,
            text: `Name: ${name}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`,
          });

          // Auto reply
          await resend.emails.send({
            from: "Atlas Roofing <onboarding@resend.dev>",
            to: email,
            subject: `We've received your request - Atlas Roofing Corporation`,
            text: `Hi ${name},\n\nThank you for reaching out to Atlas Roofing Corporation. We will get back to you shortly.\n\nDetails:\n${message}`,
          });

          emailSent = true;
          integrationDetails = "Sent via Resend API";
        } catch (resendError: any) {
          console.error("Resend API sending failed:", resendError.message);
          integrationDetails = `Resend Fail: ${resendError.message}`;
        }
      }

      // Return unified success
      return res.status(200).json({
        success: true,
        message: "Your inquiry has been successfully transmitted!",
        emailSent,
        details: integrationDetails,
        receivedData: { name, company, email, phone, subject },
      });

    } catch (error: any) {
      console.error("Error processing inquiry:", error);
      return res.status(500).json({
        success: false,
        error: "An unexpected error occurred while processing your inquiry. Please try again later.",
      });
    }
  });

  // Serve Vite assets / index.html based on Node environment
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to port 3000 and 0.0.0.0 (required for Cloud Run routing)
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Ready & listening on http://0.0.0.0:${PORT}`);
    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Atlas corporate server:", err);
});
