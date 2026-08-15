import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { ping } from '../services/LiveSessions.js';
import { parseBrowser, parseDevice } from '../services/DeviceParser.js';

/**
 * Fire-and-forget tracking endpoint called by the browser on every pageview and
 * heartbeat. Pings the in-memory live-session map always; persists only
 * pageviews (heartbeats/custom events skip the DB write).
 */
export const track = async (req, res, next) => {
  try {
    const { sessionId = '', path = '', page = '', referrer = '', event = false } = req.body || {};
    const userAgent = String(req.headers['user-agent'] || '');
    const ip = req.ip || req.socket?.remoteAddress || '';

    ping({
      sessionId: sessionId ? String(sessionId).slice(0, 100) : '',
      userId: req.user?._id || null,
      path: String(path || '').slice(0, 300),
    });

    if (!event) {
      await AnalyticsEvent.create({
        type: 'pageview',
        path: String(path || '').slice(0, 300),
        page: String(page || '').slice(0, 200),
        referrer: String(referrer || '').slice(0, 500),
        sessionId: sessionId ? String(sessionId).slice(0, 100) : '',
        userId: req.user?._id || null,
        browser: parseBrowser(userAgent),
        device: parseDevice(userAgent),
        userAgent: userAgent.slice(0, 300),
        ip,
      });
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
};