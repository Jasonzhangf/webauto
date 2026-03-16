/**
 * Network Recovery Module
 * 
 * Provides network error detection and recovery capabilities
 */

// Network error codes to identify
const NETWORK_ERROR_CODES = {
  DNS_FAILED: 'NS_ERROR_UNKNOWN_HOST',
  TIMEOUT: 'Timeout.*exceeded',
  CONNECTION_REFUSED: 'NS_ERROR_CONNECTION_REFUSED',
  NETWORK_CHANGED: 'NS_ERROR_NET_RESET',
  CONTEXT_DESTROYED: 'Execution context was destroyed'
};

// Recovery strategies
const RECOVERY_STRATEGY = {
  WAIT_NETWORK: {
    maxRetries: 3,
    waitMs: 30000,
    backoff: 1.5
  },
  RELOAD_PAGE: {
    maxRetries: 2,
    waitMs: 5000
  },
  BACK_TO_SEARCH: {
    maxRetries: 1,
    waitMs: 10000
  }
};

/**
 * Check if an error is a network-related error
 * @param {Error} error - The error object
 * @returns {boolean} - True if it's a network error
 */
export function isNetworkError(error) {
  const message = error?.message || '';
  return Object.values(NETWORK_ERROR_CODES).some(code => 
    message.includes(code) || new RegExp(code).test(message)
  );
}

/**
 * Check if network has recovered by testing endpoints
 * @param {Array<string>} endpoints - Endpoints to test
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<boolean>} - True if network is available
 */
export async function checkNetworkRecovery(endpoints = ['https://www.xiaohongshu.com'], timeout = 5000) {
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(endpoint, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Wait for network to recover with backoff
 * @param {Object} strategy - Recovery strategy configuration
 * @param {Function} logger - Optional logger function
 * @returns {Promise<boolean>} - True if recovered
 */
export async function waitForNetworkRecovery(strategy = RECOVERY_STRATEGY.WAIT_NETWORK, logger = null) {
  const { maxRetries, waitMs, backoff } = strategy;
  let currentWait = waitMs;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger?.(`[Network Recovery] Attempt ${attempt}/${maxRetries}: Waiting ${currentWait}ms for network recovery...`);
    
    // Wait
    await new Promise(resolve => setTimeout(resolve, currentWait));
    
    // Check recovery
    const recovered = await checkNetworkRecovery();
    
    if (recovered) {
      logger?.(`[Network Recovery] Network recovered on attempt ${attempt}`);
      return true;
    }
    
    logger?.(`[Network Recovery] Network not recovered on attempt ${attempt}`);
    
    // Increase wait time with backoff
    currentWait = Math.floor(currentWait * backoff);
  }
  
  logger?.(`[Network Recovery] Failed to recover after ${maxRetries} attempts`);
  return false;
}

/**
 * Extract error code from error message
 * @param {Error} error - The error object
 * @returns {string|null} - Error code or null
 */
export function extractErrorCode(error) {
  const message = error?.message || '';
  
  for (const [code, pattern] of Object.entries(NETWORK_ERROR_CODES)) {
    if (new RegExp(pattern).test(message)) {
      return code;
    }
  }
  
  return null;
}

export { NETWORK_ERROR_CODES, RECOVERY_STRATEGY };
