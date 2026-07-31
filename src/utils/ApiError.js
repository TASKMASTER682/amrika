/**
 * A single error shape flows through the entire API. Controllers throw
 * this (or a subclass call) instead of hand-rolling res.status(...).json(...)
 * everywhere — the errorHandler middleware is the only place that touches
 * res for error responses.
 */
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // distinguishes expected errors from bugs/crashes
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Not authenticated') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Not authorized to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static internal(message = 'Something went wrong') {
    return new ApiError(500, message);
  }
}

module.exports = ApiError;
