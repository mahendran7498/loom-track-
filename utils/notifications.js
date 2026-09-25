/*
 * Notification dispatch helpers for the in-process scheduler.
 *
 * SMS (Twilio), WhatsApp (Twilio), and Email (SMTP) are sent only when the
 * matching credentials are configured in api/.env. When they are missing the
 * call degrades to a console log so the scheduler remains fully testable with
 * zero external services.
 */

const nodemailer = require("nodemailer");

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SMS_FROM = process.env.TWILIO_SMS_FROM;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || "maintenance-alerts@example.com";

let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  try {
    const { Client } = require("twilio");
    twilioClient = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  } catch (err) {
    console.error("[notifications] twilio package unavailable:", err.message);
  }
}

async function sendSms(toPhone, message) {
  if (!twilioClient || !TWILIO_SMS_FROM) {
    console.log(`[SMS - not configured, logging only] to=${toPhone}: ${message}`);
    return { status: "skipped", reason: "twilio not configured" };
  }
  try {
    const msg = await twilioClient.messages.create({ body: message, from: TWILIO_SMS_FROM, to: toPhone });
    return { status: "sent", sid: msg.sid };
  } catch (err) {
    console.error(`[SMS] failed to ${toPhone}: ${err.message}`);
    return { status: "failed", error: String(err.message) };
  }
}

async function sendWhatsApp(toPhone, message) {
  if (!twilioClient || !TWILIO_WHATSAPP_FROM) {
    console.log(`[WhatsApp - not configured, logging only] to=${toPhone}: ${message}`);
    return { status: "skipped", reason: "twilio not configured" };
  }
  try {
    const to = toPhone.startsWith("whatsapp:") ? toPhone : `whatsapp:${toPhone}`;
    const msg = await twilioClient.messages.create({
      body: message,
      from: TWILIO_WHATSAPP_FROM,
      to,
    });
    return { status: "sent", sid: msg.sid };
  } catch (err) {
    console.error(`[WhatsApp] failed to ${toPhone}: ${err.message}`);
    return { status: "failed", error: String(err.message) };
  }
}

async function sendEmail(toEmail, subject, message) {
  if (!SMTP_HOST || !SMTP_USER) {
    console.log(`[Email - not configured, logging only] to=${toEmail} subject=${subject}: ${message}`);
    return { status: "skipped", reason: "smtp not configured" };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
    await transporter.sendMail({ from: SMTP_FROM, to: toEmail, subject, text: message });
    return { status: "sent" };
  } catch (err) {
    console.error(`[Email] failed to ${toEmail}: ${err.message}`);
    return { status: "failed", error: String(err.message) };
  }
}

module.exports = { sendSms, sendWhatsApp, sendEmail };