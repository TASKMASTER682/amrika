import ErrorLog from '../models/ErrorLog.js';

const MAX_STACK = 20000;

/** Accepts client/server error reports. Anonymous is fine; user is attached when present. */
export const reportError = async (req, res, next) => {
  try {
    const {
      source = 'client',
      type = 'Error',
      message,
      stack = '',
      url = '',
      method = '',
      statusCode = null,
      route = '',
      meta = {},
    } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'A non-empty message is required.' });
    }

    const log = await ErrorLog.create({
      source: source === 'server' ? 'server' : 'client',
      type: String(type).slice(0, 100) || 'Error',
      message: message.slice(0, 2000),
      stack: String(stack || '').slice(0, MAX_STACK),
      url: String(url || '').slice(0, 1000),
      method: String(method || '').slice(0, 20),
      statusCode: Number(statusCode) || null,
      route: String(route || '').slice(0, 300),
      userId: req.user?._id || null,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
      ip: req.ip || req.socket?.remoteAddress || '',
      meta: meta && typeof meta === 'object' ? meta : {},
    });

    res.status(201).json({ success: true, message: 'Error logged.', id: log._id });
  } catch (error) {
    next(error);
  }
};

/** Admin: paginated, filterable error log list (plus unresolved count for badges). */
export const listErrors = async (req, res, next) => {
  try {
    const { status, source, q, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status && ['Unresolved', 'Resolved', 'Ignored'].includes(status)) filter.status = status;
    if (source && ['client', 'server'].includes(source)) filter.source = source;
    if (q && typeof q === 'string') filter.message = { $regex: q, $options: 'i' };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

    const [logs, total, unresolved] = await Promise.all([
      ErrorLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('userId', 'name email'),
      ErrorLog.countDocuments(filter),
      ErrorLog.countDocuments({ status: 'Unresolved' }),
    ]);

    res.json({ success: true, data: logs, total, unresolved, page: pageNum, limit: limitNum });
  } catch (error) {
    next(error);
  }
};

/** Admin: mark an error as resolved (or ignored). */
export const updateErrorStatus = async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['Unresolved', 'Resolved', 'Ignored'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    const log = await ErrorLog.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!log) return res.status(404).json({ success: false, message: 'Error log not found.' });
    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
};

/** Admin: delete a single error log. */
export const deleteError = async (req, res, next) => {
  try {
    const log = await ErrorLog.findByIdAndDelete(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: 'Error log not found.' });
    res.json({ success: true, message: 'Error log deleted.' });
  } catch (error) {
    next(error);
  }
};