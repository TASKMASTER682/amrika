/**
 * Pluggable email service. Reads SMTP settings from env. If SMTP isn't
 * configured or nodemailer isn't installed, falls back to a no-op that logs
 * — the rest of the app must never crash because mail is unavailable.
 */

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  let nodemailer;
  try {
    // Lazy import so the backend boots even if nodemailer is not installed
    // and SMTP is not configured.
    nodemailer = require('nodemailer');
  } catch (e) {
    console.warn('[MailService] nodemailer not installed — email disabled.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
};

export const sendMail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[MailService] SMTP not configured — skipped email to ${Array.isArray(to) ? to.length + ' recipients' : to}`);
    return { skipped: true };
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@examos.app';

  // Support both single address and arrays (email blast)
  const recipients = Array.isArray(to) ? to.join(', ') : to;

  return transporter.sendMail({ from, to: recipients, subject, html, text });
};

/**
 * Send an announcement to all active users (email blast).
 * Collects up to `limit` addresses per run to keep the mailshot bounded.
 */
export const sendAnnouncementBlast = async ({ title, message, audience, limit = 500 }) => {
  const { default: User } = await import('../models/User.js');

  const filter = { active: true };
  if (audience === 'admin') {
    filter.role = { $in: ['Super Admin', 'Content Manager', 'Support'] };
  } else {
    filter.role = 'User';
  }

  const users = await User.find(filter).select('email name').limit(limit).lean();
  const emails = users.map((u) => u.email).filter(Boolean);

  const subject = `📢 ${title}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="margin:0 0 8px;color:#111827">${title}</h2>
      <p style="color:#4b5563;line-height:1.6">${message.replace(/\n/g, '<br/>')}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
      <p style="color:#9ca3af;font-size:12px">You are receiving this because you're registered on ExamOS.</p>
    </div>
  `;

  return sendMail({ to: emails, subject, html });
};

