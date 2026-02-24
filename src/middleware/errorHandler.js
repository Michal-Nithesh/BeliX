/**
 * Error Handler Middleware
 * Global error handling for Express
 */

const logger = require('../../utils/logger');

/**
 * Async error wrapper
 * Catches errors in async route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler
 * Should be the last middleware
 */
function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Determine error type and status code
  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || 'Internal server error';
  let errorType = err.type || 'InternalServerError';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorType = 'ValidationError';
    errorMessage = err.message;
  }

  if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorType = 'UnauthorizedError';
    errorMessage = 'Please authenticate';
  }

  if (err.name === 'ForbiddenError') {
    statusCode = 403;
    errorType = 'ForbiddenError';
    errorMessage = 'Access denied';
  }

  if (err.code === 'ENOTFOUND') {
    statusCode = 404;
    errorType = 'NotFoundError';
    errorMessage = 'Resource not found';
  }

  // Send error response
  if (req.accepts('json')) {
    return res.status(statusCode).json({
      error: {
        type: errorType,
        message: errorMessage,
        status: statusCode,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      },
    });
  }

  // Render error page for HTML requests
  res.status(statusCode).render('error', {
    title: `${statusCode} Error`,
    message: errorMessage,
    error: process.env.NODE_ENV === 'development' ? err : {},
  });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res, next) {
  logger.warn('404 Not found', { url: req.url, method: req.method });

  if (req.accepts('json')) {
    return res.status(404).json({
      error: {
        type: 'NotFoundError',
        message: 'Resource not found',
        status: 404,
        path: req.url,
      },
    });
  }

  res.status(404).render('error', {
    title: '404 Not Found',
    message: 'The page you are looking for does not exist',
  });
}

module.exports = {
  asyncHandler,
  errorHandler,
  notFoundHandler,
};
