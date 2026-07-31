const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const applySecurity = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');
const config = require('./config/env');

const app = express();

applySecurity(app);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' })); // 2mb covers base64 question images pasted from the parser; large media should go through pre-signed uploads instead
app.use(express.urlencoded({ extended: true }));

if (config.env === 'development') {
  app.use(morgan('dev'));
}

app.use('/api', apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
