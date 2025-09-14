/**
 * Cookie Management System Types
 */

/**
 * @typedef {Object} Cookie
 * @property {string} name - Cookie name
 * @property {string} value - Cookie value
 * @property {string} domain - Cookie domain
 * @property {string} path - Cookie path
 * @property {number} expires - Expiration timestamp (-1 for session cookie)
 * @property {boolean} httpOnly - HTTP only flag
 * @property {boolean} secure - Secure flag
 * @property {string} sameSite - SameSite attribute
 */

/**
 * @typedef {Object} CookieHealthStatus
 * @property {boolean} isValid - Whether cookie is valid
 * @property {boolean} isExpired - Whether cookie is expired
 * @property {boolean} hasSessionCookie - Whether session cookie exists
 * @property {number} validCookies - Number of valid cookies
 * @property {number} totalCookies - Total number of cookies
 * @property {Date} expiresAt - Earliest expiration date
 * @property {string[]} warnings - List of warnings
 */

/**
 * @typedef {Object} CookieStorageStats
 * @property {number} totalDomains - Total number of domains
 * @property {number} totalCookies - Total number of cookies
 * @property {Object.<string, number>} domainStats - Statistics per domain
 * @property {Date} lastCleanup - Last cleanup timestamp
 */

/**
 * @typedef {Object} CookieValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - List of warnings
 * @property {number} score - Validation score (0-100)
 */

/**
 * @typedef {Object} CookieAutomationConfig
 * @property {boolean} autoRefresh - Enable auto refresh
 * @property {number} refreshInterval - Refresh interval in milliseconds
 * @property {boolean} backupEnabled - Enable backup
 * @property {number} backupInterval - Backup interval in milliseconds
 * @property {boolean} validationEnabled - Enable validation
 */

/**
 * @typedef {Object} CookieDomainConfig
 * @property {string[]} requiredCookies - List of required cookie names
 * @property {string[]} sessionCookies - List of session cookie names
 * @property {number} refreshThreshold - Refresh threshold in milliseconds
 * @property {string} loginUrl - Login URL for refresh
 * @property {boolean} autoLogin - Enable auto login
 */