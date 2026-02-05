/**
 * Timezone utilities for Asia/Kolkata
 */

const TIMEZONE = 'Asia/Kolkata';

/**
 * Get current time in Asia/Kolkata timezone
 * @returns {Date} Current date/time adjusted to Asia/Kolkata
 */
function getCurrentTimeInTimeZone() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const dateMap = {};
    
    parts.forEach(({ type, value }) => {
        dateMap[type] = value;
    });
    
    return new Date(
        dateMap.year,
        parseInt(dateMap.month) - 1,
        dateMap.day,
        dateMap.hour,
        dateMap.minute,
        dateMap.second
    );
}

/**
 * Get next scheduled time in Asia/Kolkata timezone
 * @param {number} targetHour - Target hour (0-23)
 * @param {number} targetMinute - Target minute (0-59)
 * @returns {Date} Next occurrence of the target time
 */
function getNextScheduledTime(targetHour, targetMinute) {
    const now = getCurrentTimeInTimeZone();
    const next = new Date(now);
    
    next.setHours(targetHour, targetMinute, 0, 0);
    
    // If the target time has passed today, schedule for tomorrow
    if (next <= now) {
        next.setDate(next.getDate() + 1);
    }
    
    return next;
}

/**
 * Calculate milliseconds until a target time in Asia/Kolkata timezone
 * @param {number} targetHour - Target hour (0-23)
 * @param {number} targetMinute - Target minute (0-59)
 * @returns {number} Milliseconds until the target time
 */
function getDelayUntilNextScheduledTime(targetHour, targetMinute) {
    const now = getCurrentTimeInTimeZone();
    const nextScheduled = getNextScheduledTime(targetHour, targetMinute);
    
    // Calculate the delay accounting for timezone offset differences
    const systemNow = new Date();
    const nextInUTC = new Date(nextScheduled);
    
    // Adjust for timezone offset
    const tzOffset = systemNow.getTime() - now.getTime();
    const adjustedNextTime = nextInUTC.getTime() + tzOffset;
    
    return Math.max(0, adjustedNextTime - systemNow.getTime());
}

/**
 * Format time in Asia/Kolkata timezone
 * @param {Date} date - Date to format
 * @param {string} format - Format type: 'time', 'datetime', or 'date'
 * @returns {string} Formatted time string
 */
function formatTimeInTimeZone(date, format = 'datetime') {
    const options = {
        timeZone: TIMEZONE,
    };
    
    if (format === 'time' || format === 'datetime') {
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.second = '2-digit';
        options.hour12 = false;
    }
    
    if (format === 'date' || format === 'datetime') {
        options.year = 'numeric';
        options.month = '2-digit';
        options.day = '2-digit';
    }
    
    return new Date(date).toLocaleString('en-US', options);
}

/**
 * Get time info in both system and Asia/Kolkata timezone for logging
 * @param {Date} date - Date to format
 * @returns {string} Log string with both timezones
 */
function getTimeWithTimezoneInfo(date) {
    const systemTime = date.toLocaleString('en-US');
    const kolkataTime = formatTimeInTimeZone(date, 'datetime');
    return `${systemTime} (System) / ${kolkataTime} (Asia/Kolkata)`;
}

module.exports = {
    getCurrentTimeInTimeZone,
    getNextScheduledTime,
    getDelayUntilNextScheduledTime,
    formatTimeInTimeZone,
    getTimeWithTimezoneInfo,
    TIMEZONE,
};
