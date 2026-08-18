/**
 * Pluggable email service. Reads SMTP settings from env. If SMTP isn't
 * configured or nodemailer isn't installed, falls back to a no-op that logs
 * — the rest of the app must never crash because mail is unavailable.
 */
import { CLIENT_URL, emailVerificationExpiresMs } from '../config/env.js';

const getTransporter = async () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch (e) {
    console.warn('[MailService] nodemailer not installed — email disabled.');
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';

  const tryCreateTransport = (testPort, testSecure) => {
    return nodemailer.createTransport({
      host,
      port: testPort,
      secure: testSecure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  };

  // Try primary port, then fallback ports (Brevo supports 587, 465, 2525)
  const ports = [port, 465, 2525];
  const secures = [secure, true, false];

  for (let i = 0; i < ports.length; i += 1) {
    try {
      const transporter = tryCreateTransport(ports[i], secures[i]);
      await transporter.verify();
      console.log(`[MailService] SMTP connected on port ${ports[i]} (secure=${secures[i]})`);
      return transporter;
    } catch (err) {
      console.warn(`[MailService] SMTP port ${ports[i]} failed: ${err.message}`);
    }
  }

  console.error('[MailService] All SMTP ports failed — email sending disabled');
  return null;
};

export const sendMail = async ({ to, subject, html, text }) => {
  const transporter = await getTransporter();
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

/**
 * Send an email verification link to a newly registered user.
 * The token links back to the frontend so the user can click through.
 */
export const sendVerificationEmail = async (email, name, token, clientUrl = CLIENT_URL) => {
  const verifyUrl = `${clientUrl}/verify-email?token=${token}`;
  const expiresHours = Math.round((emailVerificationExpiresMs / (60 * 60 * 1000)) * 10) / 10;
  const expiresLabel = expiresHours < 1
    ? `${Math.round(emailVerificationExpiresMs / 60000)} minutes`
    : `${expiresHours} hour${expiresHours === 1 ? '' : 's'}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
      <h2 style="margin:0 0 8px;color:#111827">Verify your ExamOS email address</h2>
      <p style="color:#4b5563;line-height:1.6">Hi ${name || 'there'},</p>
      <p style="color:#4b5563;line-height:1.6">Thanks for signing up on ExamOS. Please click the button below to verify your email address and activate your account.</p>
      <div style="margin:24px 0;text-align:center">
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 28px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold">Verify Email Address</a>
      </div>
      <p style="color:#4b5563;line-height:1.6">Or copy and paste this link: <a href="${verifyUrl}" style="color:#2563eb">${verifyUrl}</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0" />
      <p style="color:#9ca3af;font-size:12px">This link expires in ${expiresLabel}. If you didn't sign up for ExamOS, you can safely ignore this email.</p>
    </div>
  `;

  const text = `Verify your ExamOS email address\n\nHi ${name || 'there'},\n\nPlease verify your email address by visiting:\n${verifyUrl}\n\nThis link expires in ${expiresLabel}.`;

  return sendMail({
    to: email,
    subject: 'Verify your ExamOS email address',
    html,
    text,
  });
};

