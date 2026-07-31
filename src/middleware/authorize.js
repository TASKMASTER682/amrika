const ApiError = require('../utils/ApiError');

/**
 * Usage: router.post('/questions', authenticate, authorize('content_manager', 'super_admin'), handler)
 * Kept as a simple allow-list rather than a permissions matrix — with five
 * roles this stays readable; reach for a capability table if roles grow
 * much further or permissions start varying per-organization.
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' cannot perform this action`));
    }
    next();
  };
}

module.exports = authorize;
