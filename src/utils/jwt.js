const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DEFAULT_EXPIRES_IN = '12h';

function signToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: options.expiresIn || DEFAULT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };


