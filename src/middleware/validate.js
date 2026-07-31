const ApiError = require('../utils/ApiError');

/**
 * Wraps a Zod schema into Express middleware. Usage:
 *   router.post('/', validate(createQuestionSchema), controller.create)
 * The parsed (and coerced/defaulted) result replaces req.body so controllers
 * always work with clean, typed data instead of raw request input.
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return next(ApiError.badRequest('Validation failed', details));
    }
    req[source] = result.data;
    next();
  };
}

module.exports = validate;
