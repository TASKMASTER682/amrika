const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Access tokens are short-lived and sent on every request (Authorization header).
 * Refresh tokens are long-lived, stored as an httpOnly cookie, and only ever
 * used to mint a new access token — this limits the blast radius if an
 * access token leaks (e.g. via XSS) since it expires in minutes.
 */
function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiresIn });
}

function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
