/**
 * Wraps an async route handler so any rejected promise is forwarded to
 * Express's error-handling middleware instead of crashing the process
 * (Express 4 does not do this automatically for async functions).
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
