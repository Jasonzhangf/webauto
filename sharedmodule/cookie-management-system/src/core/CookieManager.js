/**
 * Cookie Manager Implementation
 */

import { ICookieManager } from '../interfaces/CookieInterfaces.js';

export class CookieManager extends ICookieManager {
  constructor(storage, validator, encryptor = null) {
    super();
    this.storage = storage;
    this.validator = validator;
    this.encryptor = encryptor;
  }

  /**
   * Load cookies to page
   */
  async loadCookies(page, domain) {
    try {
      console.log(`[CookieManager] Loading cookies for ${domain}...`);
      
      // Load cookies from storage
      let cookies = await this.storage.loadCookies(domain);
      
      if (!Array.isArray(cookies) || cookies.length === 0) {
        console.log(`[CookieManager] No cookies found for ${domain}`);
        return false;
      }
      
      // Decrypt cookies if encryption is enabled
      if (this.encryptor) {
        try {
          cookies = await this.encryptor.decryptCookieJar(cookies);
        } catch (error) {
          console.warn(`[CookieManager] Failed to decrypt cookies for ${domain}:`, error);
          // Continue with potentially unencrypted cookies
        }
      }
      
      // Filter cookies for the target domain
      const filteredCookies = this.filterCookiesByDomain(cookies, domain);
      
      if (filteredCookies.length === 0) {
        console.log(`[CookieManager] No applicable cookies found for ${domain}`);
        return false;
      }
      
      // Set cookies on the page
      await page.context().addCookies(filteredCookies);
      
      console.log(`[CookieManager] Loaded ${filteredCookies.length} cookies for ${domain}`);
      return true;
    } catch (error) {
      console.error(`[CookieManager] Failed to load cookies for ${domain}:`, error);
      return false;
    }
  }

  /**
   * Save cookies from page
   */
  async saveCookies(page, domain = null) {
    try {
      const url = page.url();
      if (!url || url === 'about:blank') {
        console.log('[CookieManager] Cannot save cookies from blank page');
        return false;
      }

      const targetDomain = domain || new URL(url).hostname;
      console.log(`[CookieManager] Saving cookies for ${targetDomain}...`);
      
      // Get cookies from page
      const cookies = await page.context().cookies([url]);
      
      if (!Array.isArray(cookies) || cookies.length === 0) {
        console.log(`[CookieManager] No cookies found on page for ${targetDomain}`);
        return false;
      }
      
      // Process cookies for storage
      let processedCookies = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires || -1,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite || 'Lax'
      }));
      
      // Encrypt cookies if encryption is enabled
      if (this.encryptor) {
        try {
          processedCookies = await this.encryptor.encryptCookieJar(processedCookies);
        } catch (error) {
          console.error(`[CookieManager] Failed to encrypt cookies for ${targetDomain}:`, error);
          return false;
        }
      }
      
      // Store cookies
      const success = await this.storage.storeCookies(targetDomain, processedCookies);
      
      if (success) {
        console.log(`[CookieManager] Successfully saved ${processedCookies.length} cookies for ${targetDomain}`);
      }
      
      return success;
    } catch (error) {
      console.error(`[CookieManager] Failed to save cookies:`, error);
      return false;
    }
  }

  /**
   * Validate cookie health
   */
  async validateCookieHealth(domain) {
    try {
      // Load cookies
      const cookies = await this.storage.loadCookies(domain);
      
      if (!Array.isArray(cookies)) {
        return {
          isValid: false,
          isExpired: true,
          hasSessionCookie: false,
          validCookies: 0,
          totalCookies: 0,
          expiresAt: null,
          warnings: ['Invalid cookie data']
        };
      }
      
      // Decrypt cookies if encryption is enabled
      let decryptedCookies = cookies;
      if (this.encryptor) {
        try {
          decryptedCookies = await this.encryptor.decryptCookieJar(cookies);
        } catch (error) {
          console.warn(`[CookieManager] Failed to decrypt cookies for validation:`, error);
          // Continue with potentially unencrypted cookies
        }
      }
      
      // Validate health
      const health = await this.validator.validateDomainHealth(domain, decryptedCookies);
      
      console.log(`[CookieManager] Health check for ${domain}: ${health.isValid ? 'HEALTHY' : 'UNHEALTHY'}`);
      return health;
    } catch (error) {
      console.error(`[CookieManager] Failed to validate cookie health for ${domain}:`, error);
      return {
        isValid: false,
        isExpired: true,
        hasSessionCookie: false,
        validCookies: 0,
        totalCookies: 0,
        expiresAt: null,
        warnings: [`Validation error: ${error.message}`]
      };
    }
  }

  /**
   * Filter cookies by domain
   */
  filterCookiesByDomain(cookies, domain) {
    return cookies.filter(cookie => {
      const cookieDomain = cookie.domain || '';
      const domainParts = domain.split('.');
      const cookieDomainParts = cookieDomain.split('.');
      
      // Check exact match
      if (cookieDomain === domain) return true;
      
      // Check subdomain matches
      if (cookieDomain.startsWith('.')) {
        const baseCookieDomain = cookieDomain.substring(1);
        return domain === baseCookieDomain || domain.endsWith('.' + baseCookieDomain);
      }
      
      // Check if domain ends with cookie domain
      if (domain.endsWith(cookieDomain) && domain.length > cookieDomain.length) {
        return domain.charAt(domain.length - cookieDomain.length - 1) === '.';
      }
      
      return false;
    });
  }

  /**
   * Clear cookies for domain
   */
  async clearCookies(page, domain) {
    try {
      // Clear cookies from page
      await page.context().clearCookies();
      
      // Delete cookies from storage
      await this.storage.deleteCookies(domain);
      
      console.log(`[CookieManager] Cleared cookies for ${domain}`);
      return true;
    } catch (error) {
      console.error(`[CookieManager] Failed to clear cookies for ${domain}:`, error);
      return false;
    }
  }

  /**
   * Get cookie summary
   */
  async getCookieSummary(domain) {
    try {
      const cookies = await this.storage.loadCookies(domain);
      const health = await this.validateCookieHealth(domain);
      
      return {
        domain,
        cookieCount: cookies.length,
        health,
        lastUpdated: cookies.length > 0 ? cookies[0].storedAt : null,
        domains: [...new Set(cookies.map(c => c.domain))].join(', ')
      };
    } catch (error) {
      console.error(`[CookieManager] Failed to get cookie summary for ${domain}:`, error);
      return null;
    }
  }

  /**
   * Import cookies from file
   */
  async importCookies(domain, filePath) {
    try {
      const fs = await import('fs-extra');
      const path = await import('path');
      
      const cookieData = await fs.readJSON(filePath);
      
      if (!Array.isArray(cookieData)) {
        throw new Error('Invalid cookie file format');
      }
      
      let processedCookies = cookieData;
      
      // Decrypt if needed
      if (this.encryptor) {
        try {
          processedCookies = await this.encryptor.decryptCookieJar(cookieData);
        } catch (error) {
          console.warn('[CookieManager] Failed to decrypt imported cookies:', error);
        }
      }
      
      // Store cookies
      const success = await this.storage.storeCookies(domain, processedCookies);
      
      if (success) {
        console.log(`[CookieManager] Imported ${processedCookies.length} cookies for ${domain}`);
      }
      
      return success;
    } catch (error) {
      console.error(`[CookieManager] Failed to import cookies for ${domain}:`, error);
      return false;
    }
  }

  /**
   * Export cookies to file
   */
  async exportCookies(domain, filePath) {
    try {
      const fs = await import('fs-extra');
      
      const cookies = await this.storage.loadCookies(domain);
      
      if (!Array.isArray(cookies) || cookies.length === 0) {
        console.log(`[CookieManager] No cookies to export for ${domain}`);
        return false;
      }
      
      await fs.writeJSON(filePath, cookies, { spaces: 2 });
      
      console.log(`[CookieManager] Exported ${cookies.length} cookies for ${domain} to ${filePath}`);
      return true;
    } catch (error) {
      console.error(`[CookieManager] Failed to export cookies for ${domain}:`, error);
      return false;
    }
  }
}