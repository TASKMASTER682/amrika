import AnalyticsEvent from '../models/AnalyticsEvent.js';
import { getLive as getLiveSessions } from '../services/LiveSessions.js';

const startOfDayUtc = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** Live sessions right now (in-memory). */
export const getLive = async (req, res, next) => {
  try {
    const sessions = getLiveSessions();
    res.json({ success: true, live: sessions.length, sessions });
  } catch (error) {
    next(error);
  }
};

const topBy = async (field, limit, from) => {
  const rows = await AnalyticsEvent.aggregate([
    { $match: { type: 'pageview', [field]: { $ne: '' }, createdAt: { $gte: from } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ name: r._id, count: r.count }));
};

const hostname = (raw = '') => {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return raw ? 'Other' : '(direct)';
  }
};

const getTrend = async (days) => {
  const start = startOfDayUtc(days - 1);
  const rows = await AnalyticsEvent.aggregate([
    { $match: { type: 'pageview', createdAt: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        pageviews: { $sum: 1 },
        sessions: { $addToSet: { $ifNull: ['$sessionId', ''] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDayUtc(i);
    const key = d.toISOString().slice(0, 10);
    const r = map.get(key);
    out.push({
      day: d.toLocaleDateString('en', { day: '2-digit', month: 'short' }),
      pageviews: r ? r.pageviews : 0,
      uniqueSessions: r ? new Set((r.sessions || []).filter(Boolean)).size : 0,
    });
  }
  return out;
};

/** Daily visitors + pageview dashboard summary. */
export const getVisits = async (req, res, next) => {
  try {
    const todayStart = startOfDayUtc();
    const yesterdayStart = startOfDayUtc(1);

    const [todayPageviews, todaySessions, yesterdayPageviews, trend, topPages, referrers, browsers, devices] =
      await Promise.all([
        AnalyticsEvent.countDocuments({ type: 'pageview', createdAt: { $gte: todayStart } }),
        AnalyticsEvent.distinct('sessionId', {
          type: 'pageview',
          sessionId: { $ne: '' },
          createdAt: { $gte: todayStart },
        }),
        AnalyticsEvent.countDocuments({ type: 'pageview', createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
        getTrend(14),
        topBy('path', 10, startOfDayUtc(6)),
        topBy('referrer', 10, startOfDayUtc(6)),
        topBy('browser', 8, startOfDayUtc(6)),
        topBy('device', 4, startOfDayUtc(6)),
      ]);

    res.json({
      success: true,
      data: {
        today: { pageviews: todayPageviews, uniqueSessions: todaySessions.length },
        yesterday: { pageviews: yesterdayPageviews },
        trend,
        topPages,
        topReferrers: referrers.map((r) => ({ name: hostname(r.name), count: r.count })),
        browsers,
        devices,
      },
    });
  } catch (error) {
    next(error);
  }
};