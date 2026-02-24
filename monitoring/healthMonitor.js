/**
 * Health Monitoring Process
 * 
 * Runs as separate PM2 process to:
 * - Monitor bot health via HTTP endpoint
 * - Track memory and CPU usage
 * - Send alerts if issues detected
 * - Log metrics for analysis
 * 
 * Usage with PM2: included in ecosystem.config.js
 */

const http = require('http');
const logger = require('../utils/logger');
const config = require('../config/constants');

/**
 * Health Check Configuration
 */
const healthConfig = {
    botUrl: `http://localhost:${config.server.port}`,
    checkInterval: parseInt(process.env.MONITOR_INTERVAL) || 30000, // 30 seconds
    timeoutMs: 5000, // 5 second timeout
    unhealthyThreshold: 3, // Alert after 3 consecutive failures
};

/**
 * Health metrics tracking
 */
const metrics = {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    consecutiveFailures: 0,
    lastCheckTime: null,
    lastSuccessTime: null,
    averageResponseTime: 0,
    responseTimes: [], // Keep last 10 response times
};

/**
 * Perform health check on bot
 */
async function checkBotHealth() {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const request = http.get(`${healthConfig.botUrl}/health`, (response) => {
            const statusCode = response.statusCode;
            const responseTime = Date.now() - startTime;

            // Track response time
            metrics.responseTimes.push(responseTime);
            if (metrics.responseTimes.length > 10) {
                metrics.responseTimes.shift();
            }

            // Calculate average
            metrics.averageResponseTime = 
                metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;

            if (statusCode === 200) {
                resolve({
                    healthy: true,
                    statusCode,
                    responseTime,
                });
            } else {
                reject(new Error(`Unhealthy status code: ${statusCode}`));
            }
        });

        request.setTimeout(healthConfig.timeoutMs, () => {
            request.destroy();
            reject(new Error('Health check timeout'));
        });

        request.on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * Send alert webhook (e.g., to Discord)
 */
async function sendAlert(message, severity = 'error') {
    if (!config.monitoring.errorWebhookUrl) {
        logger.warn('Error webhook not configured - skipping alert');
        return;
    }

    try {
        const data = JSON.stringify({
            content: `🚨 **${severity.toUpperCase()}: BeliX Bot Alert**\n${message}`,
            username: 'BeliX Monitor',
            avatar_url: 'https://images.emojiterra.com/mozilla/512px-robot_face.png',
        });

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
            },
        };

        const req = http.request(config.monitoring.errorWebhookUrl, options, (res) => {
            if (res.statusCode !== 204) {
                logger.warn('Alert webhook returned non-204 status', {
                    statusCode: res.statusCode,
                });
            }
        });

        req.on('error', (error) => {
            logger.error('Failed to send alert', { error: error.message });
        });

        req.write(data);
        req.end();
    } catch (error) {
        logger.error('Error sending alert', { error: error.message });
    }
}

/**
 * Main monitoring loop
 */
async function monitor() {
    logger.info('Health monitor started', {
        checkInterval: healthConfig.checkInterval,
        botUrl: healthConfig.botUrl,
    });

    setInterval(async () => {
        try {
            const result = await checkBotHealth();
            
            metrics.totalChecks++;
            metrics.successfulChecks++;
            metrics.consecutiveFailures = 0;
            metrics.lastCheckTime = new Date().toISOString();
            metrics.lastSuccessTime = new Date().toISOString();

            logger.debug('Health check passed', {
                responseTime: result.responseTime,
                averageResponseTime: metrics.averageResponseTime.toFixed(0),
            });

        } catch (error) {
            metrics.totalChecks++;
            metrics.failedChecks++;
            metrics.consecutiveFailures++;
            metrics.lastCheckTime = new Date().toISOString();

            logger.warn('Health check failed', {
                error: error.message,
                consecutiveFailures: metrics.consecutiveFailures,
            });

            // Send alert if threshold exceeded
            if (metrics.consecutiveFailures >= healthConfig.unhealthyThreshold) {
                await sendAlert(
                    `Bot is unhealthy. ${metrics.consecutiveFailures} consecutive failures.\n` +
                    `Error: ${error.message}`,
                    'critical'
                );
            }
        }

        // Log metrics periodically
        if (metrics.totalChecks % 10 === 0) {
            const uptime = metrics.successfulChecks / metrics.totalChecks * 100;
            logger.info('Monitor metrics', {
                totalChecks: metrics.totalChecks,
                uptime: `${uptime.toFixed(2)}%`,
                failedChecks: metrics.failedChecks,
                averageResponseTime: metrics.averageResponseTime.toFixed(0),
                lastSuccess: metrics.lastSuccessTime,
            });
        }
    }, healthConfig.checkInterval);
}

/**
 * API endpoint for monitor status
 */
function createMonitorServer() {
    const app = require('express')();
    const PORT = 3001;

    app.get('/monitor/metrics', (req, res) => {
        res.json({
            metrics,
            uptime: metrics.successfulChecks / metrics.totalChecks * 100,
            timestamp: new Date().toISOString(),
        });
    });

    app.listen(PORT, () => {
        logger.info(`Monitor API listening on port ${PORT}`);
    });
}

// ========== START MONITOR ==========

if (require.main === module) {
    monitor().catch((error) => {
        logger.error('Monitor error', { error: error.message });
        process.exit(1);
    });

    // Optional: Create monitor API
    createMonitorServer();
}

module.exports = { monitor, metrics };
