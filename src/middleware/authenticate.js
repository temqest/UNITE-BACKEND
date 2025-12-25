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

/**
 * Authentication middleware
 * 
 * Validates JWT tokens and sets req.user with minimal user data (id, email).
 * Role and permissions should be fetched from the database when needed, not from the token.
 * 
 * Supports backward compatibility with old tokens that may contain role/isSystemAdmin.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports = function authenticate(req, res, next) {
  try {
    // Log coordinator endpoint requests for diagnostics
    const isCoordinatorEndpoint = req.path && req.path.includes('/coordinator');
    if (isCoordinatorEndpoint) {
      console.log('[DIAG] Authenticate middleware - Coordinator endpoint:', {
        path: req.path,
        method: req.method,
        hasAuthHeader: !!req.headers.authorization,
        hasCookie: !!req.headers.cookie,
        timestamp: new Date().toISOString()
      });
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.substring(7) : null;

    if (token) {
      const decoded = verifyToken(token);
      
      // Set minimal user data - only id and email are guaranteed
      // Support backward compatibility: old tokens may have role/isSystemAdmin
      req.user = {
        id: decoded.id,
        email: decoded.email,
        // Backward compatibility: include role/isSystemAdmin if present in old tokens
        role: decoded.role || null,
        isSystemAdmin: decoded.isSystemAdmin || false
      };
      
      if (isCoordinatorEndpoint) {
        console.log('[DIAG] Authenticate middleware - Token validated:', {
          userId: req.user.id,
          userEmail: req.user.email,
          path: req.path
        });
      }
      
      // Note: Role and permissions should be fetched from database when needed
      // via permissionService.getUserRoles() and permissionService.getUserPermissions()
      // Do not rely on req.user.role for authorization - use permission middleware instead
      
      return next();
    }

    // Fallback: try to read an HttpOnly cookie named 'unite_user'
    // Cookie now contains minimal data (id, email) for security
    // Support backward compatibility with old cookies that may have role/isAdmin
    const cookieHeader = req.headers.cookie || '';
    if (cookieHeader) {
      const cookies = parseCookieString(cookieHeader);
      if (cookies.unite_user) {
        try {
          const parsed = JSON.parse(cookies.unite_user);
          req.user = {
            id: parsed.id || parsed.ID || null,
            email: parsed.email || parsed.Email || null,
            // Backward compatibility: include role/isAdmin if present in old cookies
            role: parsed.role || null,
            isSystemAdmin: parsed.isAdmin || parsed.isSystemAdmin || false
          };
          
          if (req.user.id && req.user.email) {
            if (isCoordinatorEndpoint) {
              console.log('[DIAG] Authenticate middleware - Cookie validated:', {
                userId: req.user.id,
                userEmail: req.user.email,
                path: req.path
              });
            }
            return next();
          }
        } catch (e) {
          // malformed cookie; fall through to unauthorized
          if (isCoordinatorEndpoint) {
            console.log('[DIAG] Authenticate middleware - Cookie parse failed:', {
              error: e.message,
              path: req.path
            });
          }
        }
      }
    }

    if (isCoordinatorEndpoint) {
      console.log('[DIAG] Authenticate middleware - Unauthorized (no token/cookie):', {
        path: req.path,
        hasAuthHeader: !!req.headers.authorization,
        hasCookie: !!req.headers.cookie
      });
    }
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};


