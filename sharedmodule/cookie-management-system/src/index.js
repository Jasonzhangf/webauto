/**
 * WebAuto Cookie Management System
 * Advanced cookie storage, validation, and automation
 */

import { CookieManager } from './core/CookieManager.js';
import { CookieValidator } from './core/CookieValidator.js';
import { CookieStorage } from './core/CookieStorage.js';
import { CookieAutomation } from './core/CookieAutomation.js';
import { CookieEncryptor } from './security/CookieEncryptor.js';

export class WebAutoCookieManagementSystem {
  constructor(config = {}) {
    this.config = {
      storagePath: './cookies',
      encryptionEnabled: true,
      autoRefresh: true,
      validationEnabled: true,
      backupEnabled: true,
      ...config
    };

    // Initialize components
    this.storage = new CookieStorage(this.config.storagePath);
    this.validator = new CookieValidator();
    this.encryptor = this.config.encryptionEnabled ? new CookieEncryptor() : null;
    this.automation = new CookieAutomation(this.config);
    this.manager = new CookieManager(this.storage, this.validator, this.encryptor);
  }

  /**
   * Initialize the cookie management system
   */
  async initialize() {
    await this.storage.initialize();
    if (this.encryptor) {
      await this.encryptor.initialize();
    }
    
    if (this.config.autoRefresh) {
      await this.automation.startAutoRefresh();
    }
  }

  /**
   * Load cookies for a specific domain
   */
  async loadCookies(page, domain) {
    return await this.manager.loadCookies(page, domain);
  }

  /**
   * Save cookies from current page
   */
  async saveCookies(page, domain = null) {
    return await this.manager.saveCookies(page, domain);
  }

  /**
   * Validate cookie health for a domain
   */
  async validateCookieHealth(domain) {
    return await this.manager.validateCookieHealth(domain);
  }

  /**
   * Get cookie statistics
   */
  getCookieStats() {
    return this.storage.getStats();
  }

  /**
   * Clean up expired cookies
   */
  async cleanupExpiredCookies() {
    return await this.storage.cleanupExpired();
  }

  /**
   * Shutdown the system
   */
  async shutdown() {
    if (this.config.autoRefresh) {
      await this.automation.stopAutoRefresh();
    }
  }
}

// Export classes for individual use
export { CookieManager } from './core/CookieManager.js';
export { CookieValidator } from './core/CookieValidator.js';
export { CookieStorage } from './core/CookieStorage.js';
export { CookieAutomation } from './core/CookieAutomation.js';
export { CookieEncryptor } from './security/CookieEncryptor.js';

// Export types and interfaces
export * from './types/CookieTypes.js';
export * from './interfaces/CookieInterfaces.js';

// Default export
export default WebAutoCookieManagementSystem;