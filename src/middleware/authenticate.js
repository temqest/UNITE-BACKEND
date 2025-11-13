const { verifyToken } = require('../utils/jwt');

function parseCookieString(cookieHeader = '') {
  const cookies = {};
  const parts = String(cookieHeader).split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookies[name] = decodeURIComponent(val);
  }
  return cookies;
}

module.exports = function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.substring(7) : null;

    if (token) {
      const decoded = verifyToken(token);
      req.user = decoded; // { id, role, district_id?, type }
      return next();
    }

    // Fallback: try to read an HttpOnly cookie named 'unite_user' which the server
    // sets on authentication. This cookie contains JSON with role/id info.
    const cookieHeader = req.headers.cookie || '';
    if (cookieHeader) {
      const cookies = parseCookieString(cookieHeader);
      if (cookies.unite_user) {
        try {
          const parsed = JSON.parse(cookies.unite_user);
          // Normalize to the shape expected by requireRoles and other logic.
          req.user = {
            id: parsed.id || parsed.ID || null,
            role: parsed.role || parsed.staff_type || null,
            email: parsed.email || parsed.Email || null,
            isAdmin: !!parsed.isAdmin
          };
          return next();
        } catch (e) {
          // malformed cookie; fall through to unauthorized
        }
      }
    }

    return res.status(401).json({ success: false, message: 'Unauthorized' });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};


