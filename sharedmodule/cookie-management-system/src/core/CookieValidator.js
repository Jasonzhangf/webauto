/**
 * Cookie Validator Implementation
 */

import { ICookieValidator } from '../interfaces/CookieInterfaces.js';

export class CookieValidator extends ICookieValidator {
  constructor() {
    super();
    this.domainConfigs = new Map();
    this.initializeDefaultConfigs();
  }

  /**
   * Initialize default domain configurations
   */
  initializeDefaultConfigs() {
    // Weibo configuration
    this.domainConfigs.set('weibo.com', {
      requiredCookies: ['SUB', 'SUBP', 'SRT', 'SCF'],
      sessionCookies: ['SUB', 'SUBP'],
      refreshThreshold: 24 * 60 * 60 * 1000, // 24 hours
      loginUrl: 'https://weibo.com/login.php'
    });

    // Generic configuration
    this.domainConfigs.set('default', {
      requiredCookies: ['session', 'token'],
      sessionCookies: ['session'],
      refreshThreshold: 12 * 60 * 60 * 1000, // 12 hours
      loginUrl: null
    });
  }

  /**
   * Validate cookie structure
   */
  async validateCookie(cookie) {
    const errors = [];
    const warnings = [];
    let score = 100;

    // Check required fields
    const requiredFields = ['name', 'value', 'domain', 'path'];
    for (const field of requiredFields) {
      if (!cookie[field]) {
        errors.push(`Missing required field: ${field}`);
        score -= 20;
      }
    }

    // Check name format
    if (cookie.name && !/^[a-zA-Z0-9_-]+$/.test(cookie.name)) {
      warnings.push('Cookie name contains invalid characters');
      score -= 5;
    }

    // Check domain format
    if (cookie.domain && !/^[a-zA-Z0-9.-]+$/.test(cookie.domain)) {
      warnings.push('Cookie domain format is invalid');
      score -= 10;
    }

    // Check expiration
    if (cookie.expires !== -1 && cookie.expires !== 0) {
      const now = Date.now() / 1000;
      if (cookie.expires < now) {
        errors.push('Cookie is expired');
        score = 0;
      } else if (cookie.expires < now + 3600) { // Expires within 1 hour
        warnings.push('Cookie will expire soon');
        score -= 15;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score)
    };
  }

  /**
   * Validate cookie health for domain
   */
  async validateDomainHealth(domain, cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return {
        isValid: false,
        isExpired: true,
        hasSessionCookie: false,
        validCookies: 0,
        totalCookies: 0,
        expiresAt: null,
        warnings: ['No cookies found']
      };
    }

    const config = this.domainConfigs.get(domain) || this.domainConfigs.get('default');
    const now = Date.now() / 1000;
    
    let validCookies = 0;
    let hasSessionCookie = false;
    let earliestExpiration = null;
    const warnings = [];

    // Check each cookie
    for (const cookie of cookies) {
      const validation = await this.validateCookie(cookie);
      if (validation.valid) {
        validCookies++;
        
        // Check expiration
        if (cookie.expires !== -1 && cookie.expires !== 0) {
          if (!earliestExpiration || cookie.expires < earliestExpiration) {
            earliestExpiration = cookie.expires;
          }
        }
        
        // Check if it's a session cookie
        if (config.sessionCookies.includes(cookie.name)) {
          hasSessionCookie = true;
        }
      }
    }

    // Check for required cookies
    const missingCookies = config.requiredCookies.filter(reqName => 
      !cookies.some(cookie => cookie.name === reqName)
    );
    
    if (missingCookies.length > 0) {
      warnings.push(`Missing required cookies: ${missingCookies.join(', ')}`);
    }

    // Check if cookies are expiring soon
    if (earliestExpiration && earliestExpiration < now + config.refreshThreshold) {
      warnings.push('Cookies will expire soon');
    }

    return {
      isValid: validCookies > 0 && missingCookies.length === 0,
      isExpired: validCookies === 0,
      hasSessionCookie,
      validCookies,
      totalCookies: cookies.length,
      expiresAt: earliestExpiration ? new Date(earliestExpiration * 1000) : null,
      warnings
    };
  }

  /**
   * Check if cookies are expired
   */
  async areCookiesExpired(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return true;
    }

    const now = Date.now() / 1000;
    
    for (const cookie of cookies) {
      // Skip session cookies
      if (cookie.expires === -1) continue;
      
      // Check if expired
      if (cookie.expires === 0 || cookie.expires < now) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get domain configuration
   */
  getDomainConfig(domain) {
    return this.domainConfigs.get(domain) || this.domainConfigs.get('default');
  }

  /**
   * Set domain configuration
   */
  setDomainConfig(domain, config) {
    this.domainConfigs.set(domain, config);
  }

  /**
   * Remove domain configuration
   */
  removeDomainConfig(domain) {
    this.domainConfigs.delete(domain);
  }

  /**
   * Get all domain configurations
   */
  getAllDomainConfigs() {
    return Object.fromEntries(this.domainConfigs);
  }

  /**
   * Validate cookie against security requirements
   */
  async validateSecurity(cookie) {
    const warnings = [];
    
    // Check for secure flag
    if (!cookie.secure) {
      warnings.push('Cookie does not have secure flag');
    }
    
    // Check for HttpOnly flag
    if (!cookie.httpOnly) {
      warnings.push('Cookie does not have HttpOnly flag');
    }
    
    // Check SameSite attribute
    if (!cookie.sameSite || cookie.sameSite === 'None') {
      warnings.push('Cookie does not have proper SameSite attribute');
    }
    
    return {
      secure: cookie.secure && cookie.httpOnly && cookie.sameSite !== 'None',
      warnings
    };
  }

  /**
   * Batch validate multiple cookies
   */
  async validateBatch(cookies) {
    const results = [];
    let totalScore = 0;
    let validCount = 0;

    for (const cookie of cookies) {
      const result = await this.validateCookie(cookie);
      results.push(result);
      totalScore += result.score;
      if (result.valid) validCount++;
    }

    return {
      results,
      averageScore: results.length > 0 ? totalScore / results.length : 0,
      validCount,
      totalCount: cookies.length
    };
  }
}