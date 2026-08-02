const { verifyToken } = require('./auth');

function getTokenFromHeader(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/**
 * Middleware factory: requires a valid JWT, optionally restricted to certain roles.
 * @param {string[]} [roles] - allowed roles e.g. ['organizer']. Omit to allow any authenticated user.
 */
function requireAuth(roles = []) {
  return function (req, res, next) {
    const token = getTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ message: 'Authorization token required' });
    }

    try {
      const decoded = verifyToken(token);
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ message: `Access denied. Required role: ${roles.join(' or ')}` });
      }
      req.user = decoded; // { sub: userId, role, email, iat, exp }
      next();
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}

module.exports = { requireAuth };
