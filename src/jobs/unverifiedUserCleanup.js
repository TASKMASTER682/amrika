// Unverified User Cleanup Job
// Automatically deletes accounts whose email was never verified within the
// allowed window (EMAIL_VERIFICATION_EXPIRES_MS, default 10 minutes). This runs
// periodically so no admin action is required to purge stale signups.
import User from '../models/User.js';

const log = (...args) => console.log('[UNVERIFIED_CLEANUP]', ...args);

const intervalMs = () => Number(process.env.UNVERIFIED_CLEANUP_INTERVAL_MS) || 5 * 60 * 1000; // default every 5 min

let running = false;
let started = false;

const cleanOnce = async () => {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    // Only touch accounts that went through email signup (have a verification
    // token), are still unverified, and whose verification window has elapsed.
    // Google OAuth users (emailVerified: true) and phone/OTP users (no token)
    // are never matched here.
    const result = await User.deleteMany({
      emailVerified: { $ne: true },
      emailVerificationToken: { $exists: true, $ne: null },
      emailVerificationExpiry: { $lte: now },
    });
    if (result.deletedCount > 0) {
      log(`Deleted ${result.deletedCount} unverified account(s) (window elapsed).`);
    }
  } catch (err) {
    log('FAIL', err?.message || err);
  } finally {
    running = false;
  }
};

export const startUnverifiedUserCleanup = () => {
  if (started) return;
  cleanOnce(); // fire immediately, then on interval
  setInterval(cleanOnce, intervalMs());
  log(`scheduled every ${Math.round(intervalMs() / 1000)}s`);
  started = true;
};
