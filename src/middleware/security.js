const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const config = require('../config/env');

/**
 * Applies the baseline security middleware every request goes through.
 * Order matters: helmet sets headers first, then CORS, then the two
 * sanitizers before the request body/query ever reaches a route handler.
 */
function applySecurity(app) {
  app.use(helmet());

  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true, // required for the httpOnly refresh-token cookie
    })
  );

  app.use(mongoSanitize()); // strips keys starting with '$' or containing '.' to prevent operator injection
  app.use(xss()); // escapes user input that could be reflected as HTML/script
}

module.exports = applySecurity;
