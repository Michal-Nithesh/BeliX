/**
 * Winston Logger Configuration
 * 
 * Centralized logging system for production-grade monitoring:
 * - Structured JSON logs for ELK/Datadog/CloudWatch integration
 * - Separate log files for errors and general app logs
 * - Log levels: error, warn, info, debug
 * - Automatic log rotation to prevent disk space issues
 * - Request/response timing for performance monitoring
 */

const winston = require('winston');
const path = require('path');

// Ensure logs directory exists
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom format for console output (development-friendly)
 * Shows timestamp, level, and colored output
 */
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...metadata }) => {
        let metaStr = '';
        if (Object.keys(metadata).length > 0) {
            metaStr = JSON.stringify(metadata, null, 2);
        }
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
    })
);

/**
 * JSON format for file output (machine-readable)
 * Enables structured logging for centralized monitoring
 */
const jsonFormat = winston.format.combine(
    winston.format.timestamp({ format: 'ISO' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

/**
 * Create Winston logger instance
 * Transports:
 * - Console: Development feedback
 * - All logs: General application activity
 * - Error logs: Dedicated error tracking
 */
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: jsonFormat,
    defaultMeta: {
        service: 'BeliX-Bot',
        environment: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0',
    },
    transports: [
        // Console transport - colorized, human-readable
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.CONSOLE_LOG_LEVEL || 'info',
        }),

        // General application logs
        new winston.transports.File({
            filename: path.join(logsDir, 'app.log'),
            maxsize: 10485760, // 10 MB
            maxFiles: 7, // Keep 7 days of logs
            format: jsonFormat,
        }),

        // Error logs only (dedicated error tracking)
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 10485760,
            maxFiles: 14, // Keep 14 days of error logs
            format: jsonFormat,
        }),
    ],
});

/**
 * Log levels for different scenarios
 * Following npm log levels: error > warn > info > debug
 */

// Error - Something went wrong
logger.error = (message, metadata = {}) => {
    logger.log('error', message, metadata);
};

// Warn - Potential issue but not critical
logger.warn = (message, metadata = {}) => {
    logger.log('warn', message, metadata);
};

// Info - General information
logger.info = (message, metadata = {}) => {
    logger.log('info', message, metadata);
};

// Debug - Detailed diagnostic information
logger.debug = (message, metadata = {}) => {
    logger.log('debug', message, metadata);
};

/**
 * Handle global unhandled rejections and exceptions
 * Critical for production - prevents silent failures
 */
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
        promise: String(promise),
        reason: String(reason),
        stack: reason?.stack,
    });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
        message: error.message,
        stack: error.stack,
    });
    // Give time for logs to flush before exit
    setTimeout(() => process.exit(1), 1000);
});

module.exports = logger;
