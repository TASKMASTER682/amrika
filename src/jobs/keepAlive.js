// KeepAlive Job — prevents Render.com free-tier instances from sleeping.
// Render spins down a free web service after ~15 minutes without inbound
// traffic. This job periodically pings the server's own PUBLIC URL so the
// request passes through Render's proxy and resets the inactivity timer.
//
// In LOCAL development (no KEEPALIVE_URL set) the job logs once and stays idle,
// so it never interferes with local work.

const log = (...args) => console.log('[KEEP_ALIVE]', ...args);

const publicUrl = () =>
  process.env.KEEPALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PUBLIC_URL ||
  '';

const intervalMs = () => Number(process.env.KEEPALIVE_INTERVAL_MS) || 10 * 60 * 1000; // default 10 min

// Guard so we never run two overlapping pings (e.g. slow network).
let pinging = false;
let started = false;

const ping = async () => {
  const base = publicUrl();
  if (!base) return;
  const url = `${base.replace(/\/$/, '')}/api/health`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    log(res.ok ? `OK  ${res.status}  ${url}` : `HTTP ${res.status}  ${url}`);
  } catch (err) {
    log('FAIL', err.message, url);
  }
};

const run = async () => {
  const base = publicUrl();
  if (!base) {
    if (!started) {
      log('No KEEPALIVE_URL / RENDER_EXTERNAL_URL / PUBLIC_URL set — keeping alive is disabled.');
      log('Set KEEPALIVE_URL=https://your-app.onrender.com to enable on Render.');
    }
    started = true;
    return;
  }
  if (pinging) return;
  pinging = true;
  try {
    await ping();
  } finally {
    pinging = false;
  }
};

export const startKeepAlive = () => {
  if (started) return;
  run(); // fire immediately, then on interval
  setInterval(run, intervalMs());
  const base = publicUrl() || 'unset';
  log(`scheduled every ${Math.round(intervalMs() / 1000)}s → base "${base}"`);
  started = true;
};