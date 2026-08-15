// In-memory "who is online right now" tracker. Each browser session pings on
// every pageview + a ~30s heartbeat; sessions older than LIVE_WINDOW_MS are
// treated as gone. Memory-only (no DB writes) so it stays fast and cheap.

const sessions = new Map();

/** A session is "live" if it pinged within this window. */
export const LIVE_WINDOW_MS = 2 * 60 * 1000;

const SWEEP_MS = 60 * 1000;

export const ping = ({ sessionId, userId, path }) => {
  if (!sessionId) return;
  sessions.set(sessionId, {
    lastSeen: Date.now(),
    userId: userId || null,
    path: String(path || '').slice(0, 300),
  });
};

export const getLive = (windowMs = LIVE_WINDOW_MS) => {
  const cutoff = Date.now() - windowMs;
  const active = [];
  for (const [sessionId, s] of sessions) {
    if (s.lastSeen >= cutoff) active.push({ sessionId, userId: s.userId, path: s.path, lastSeen: s.lastSeen });
  }
  return active;
};

const sweep = setInterval(() => {
  const cutoff = Date.now() - LIVE_WINDOW_MS;
  for (const [key, s] of sessions) {
    if (s.lastSeen < cutoff) sessions.delete(key);
  }
}, SWEEP_MS);
sweep.unref();