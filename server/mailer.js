const postmark = require("postmark");

const POSTMARK_API_TOKEN = process.env.POSTMARK_API_TOKEN;
const SEND_FROM_EMAIL = process.env.SEND_FROM_EMAIL;
const SEND_FROM_NAME = process.env.SEND_FROM_NAME || "Estimates";
const postmarkClient = POSTMARK_API_TOKEN ? new postmark.ServerClient(POSTMARK_API_TOKEN) : null;

if (!POSTMARK_API_TOKEN || !SEND_FROM_EMAIL) {
  console.warn(
    "\n⚠️  POSTMARK_API_TOKEN and/or SEND_FROM_EMAIL is not set. Sending estimates by email won't work until both are set in server/.env.\n"
  );
}

async function sendEstimateEmail({ toEmail, toName, replyToEmail, replyToName, subject, html, text }) {
  if (!postmarkClient || !SEND_FROM_EMAIL) {
    throw new Error("Server is missing POSTMARK_API_TOKEN or SEND_FROM_EMAIL. See server/.env.example.");
  }
  return postmarkClient.sendEmail({
    From: `${SEND_FROM_NAME} <${SEND_FROM_EMAIL}>`,
    To: toName ? `${toName} <${toEmail}>` : toEmail,
    ReplyTo: replyToEmail ? (replyToName ? `${replyToName} <${replyToEmail}>` : replyToEmail) : undefined,
    Subject: subject,
    HtmlBody: html,
    TextBody: text || undefined,
    MessageStream: "outbound",
  });
}

module.exports = { sendEstimateEmail };
