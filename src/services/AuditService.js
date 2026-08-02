import AuditLog from '../models/AuditLog.js';

/**
 * Lightweight audit helper. Never throws — audit logging must never
 * break the main request flow.
 */
export const logAudit = async ({ userId, action, details, req }) => {
  try {
    await AuditLog.create({
      userId,
      action,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      ipAddress: req?.ip,
      userAgent: req?.get('user-agent') || '',
    });
  } catch (e) {
    console.warn('Audit log write failed:', e.message);
  }
};

