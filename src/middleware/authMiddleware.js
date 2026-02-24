/**
 * Authentication Middleware
 * Validates JWT tokens or session for admin access
 */

const logger = require('../../utils/logger');

/**
 * JWT Authentication Middleware
 * Checks for valid JWT token in Authorization header
 */
function jwtAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing authorization header', { ip: req.ip });
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');

    // In production, verify JWT token properly
    // This is a simplified version
    if (token !== process.env.ADMIN_TOKEN) {
      logger.warn('Invalid token', { ip: req.ip });
      return res.status(401).json({ error: 'Invalid token' });
    }

    logger.debug('JWT auth successful', { ip: req.ip });
    next();
  } catch (error) {
    logger.error('JWT auth error', { error: error.message });
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Session-based Authentication Middleware
 * Uses Express session for admin panel authentication
 */
function sessionAuthMiddleware(req, res, next) {
  // Check if user is authenticated via session
  if (req.session && req.session.adminUser) {
    logger.debug('Session auth successful', { userId: req.session.adminUser });
    return next();
  }

  logger.warn('No valid session', { ip: req.ip });
  // Redirect to login page for web requests
  if (req.accepts('html')) {
    return res.redirect('/admin/login');
  }

  // Return error for API requests
  res.status(401).json({ error: 'Not authenticated' });
}

/**
 * Admin User Middleware
 * Checks if user has admin role
 */
function adminOnlyMiddleware(req, res, next) {
  const adminUsers = (process.env.ADMIN_USERS || '').split(',').map(id => id.trim());

  // For JWT auth
  if (req.user && !adminUsers.includes(req.user.id)) {
    logger.warn('Non-admin access attempt', { userId: req.user.id });
    return res.status(403).json({ error: 'Admin access required' });
  }

  // For session auth
  if (req.session && !adminUsers.includes(req.session.adminUser)) {
    logger.warn('Non-admin session access attempt', { userId: req.session.adminUser });
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * Rate limit auth attempts
 */
const loginAttempts = new Map();

function rateLimitAuthAttempts(req, res, next) {
  const ip = req.ip;
  const now = Date.now();

  if (!loginAttempts.has(ip)) {
    loginAttempts.set(ip, []);
  }

  const attempts = loginAttempts.get(ip);

  // Remove old attempts (older than 15 minutes)
  const recentAttempts = attempts.filter(t => now - t < 15 * 60 * 1000);

  if (recentAttempts.length >= 5) {
    logger.warn('Too many login attempts', { ip });
    return res.status(429).json({ error: 'Too many login attempts' });
  }

  recentAttempts.push(now);
  loginAttempts.set(ip, recentAttempts);

  next();
}

module.exports = {
  jwtAuthMiddleware,
  sessionAuthMiddleware,
  adminOnlyMiddleware,
  rateLimitAuthAttempts,
};
