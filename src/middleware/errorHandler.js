import ErrorLog from '../models/ErrorLog.js';

// Fire-and-forget persistence of real server errors (5xx) into the error-log
// collection so they show up in the admin dashboard. Never allowed to break the
// response path — failures here are swallowed.
const persistServerError = (err, req, statusCode, code, message) => {
  if (statusCode < 500) return; // 4xx are client mistakes, not server bugs
  ErrorLog.create({
    source: 'server',
    type: 'Server Error',
    message: `[${code}] ${message}`,
    stack: err?.stack || '',
    url: req.originalUrl || req.url || '',
    method: req.method || '',
    statusCode,
    route: (req.baseUrl || '') + (req.path || ''),
    userId: req.user?._id || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    ip: req.ip || req.socket?.remoteAddress || '',
  }).catch(() => {});
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'Something went wrong on the server.';

  // MongoDB Duplicate Key Error (e.g. unique field constraint violation)
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue)[0];
    message = `A record with this ${field} already exists.`;
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    const errors = Object.values(err.errors).map(val => val.message);
    message = `Validation failed: ${errors.join(', ')}`;
  }

  // Mongoose Cast Error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid format for field ${err.path}.`;
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Your login session has expired. Please log in again.';
  }

  // Log full error details securely in dev/production logs
  console.error(`[Error] Code: ${code} | Status: ${statusCode} | Path: ${req.originalUrl}`);
  console.error(err.stack);

  // Persist real server errors so admins can review them in the dashboard
  persistServerError(err, req, statusCode, code, message);

  res.status(statusCode).json({
    success: false,
    code,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
