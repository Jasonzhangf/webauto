/**
 * Cookie Automation Implementation
 */

import { ICookieAutomation } from '../interfaces/CookieInterfaces.js';

export class CookieAutomation extends ICookieAutomation {
  constructor(config = {}) {
    super();
    this.config = {
      autoRefresh: true,
      refreshInterval: 30 * 60 * 1000, // 30 minutes
      backupEnabled: true,
      backupInterval: 60 * 60 * 1000, // 1 hour
      validationEnabled: true,
      ...config
    };
    
    this.timers = new Map();
    this.isRunning = false;
    this.listeners = new Map();
  }

  /**
   * Start auto refresh
   */
  async startAutoRefresh() {
    if (this.isRunning) {
      console.log('[CookieAutomation] Auto refresh is already running');
      return;
    }

    this.isRunning = true;
    console.log('[CookieAutomation] Starting auto refresh...');

    if (this.config.autoRefresh) {
      this.startRefreshTimer();
    }

    if (this.config.backupEnabled) {
      this.startBackupTimer();
    }

    this.emit('started');
  }

  /**
   * Stop auto refresh
   */
  async stopAutoRefresh() {
    if (!this.isRunning) {
      console.log('[CookieAutomation] Auto refresh is not running');
      return;
    }

    this.isRunning = false;
    console.log('[CookieAutomation] Stopping auto refresh...');

    // Clear all timers
    for (const [name, timer] of this.timers) {
      clearInterval(timer);
      this.timers.delete(name);
    }

    this.emit('stopped');
  }

  /**
   * Refresh cookies for domain
   */
  async refreshCookies(domain) {
    try {
      console.log(`[CookieAutomation] Refreshing cookies for ${domain}...`);
      
      // Get current cookies
      const cookies = await this.getCookies(domain);
      
      // Validate cookies
      const health = await this.validateCookies(domain, cookies);
      
      if (health.isExpired || !health.hasSessionCookie) {
        console.log(`[CookieAutomation] Cookies for ${domain} need refresh`);
        
        // Trigger refresh event
        this.emit('refreshNeeded', { domain, health });
        
        // Try to refresh if login URL is available
        const refreshed = await this.performRefresh(domain);
        
        if (refreshed) {
          this.emit('refreshed', { domain, success: true });
          return true;
        } else {
          this.emit('refreshFailed', { domain, error: 'Auto refresh failed' });
          return false;
        }
      }
      
      console.log(`[CookieAutomation] Cookies for ${domain} are still valid`);
      return true;
    } catch (error) {
      console.error(`[CookieAutomation] Failed to refresh cookies for ${domain}:`, error);
      this.emit('refreshFailed', { domain, error });
      return false;
    }
  }

  /**
   * Start refresh timer
   */
  startRefreshTimer() {
    const timer = setInterval(async () => {
      const domains = await this.getManagedDomains();
      
      for (const domain of domains) {
        await this.refreshCookies(domain);
      }
    }, this.config.refreshInterval);
    
    this.timers.set('refresh', timer);
    console.log(`[CookieAutomation] Refresh timer started (${this.config.refreshInterval}ms interval)`);
  }

  /**
   * Start backup timer
   */
  startBackupTimer() {
    const timer = setInterval(async () => {
      await this.createBackup();
    }, this.config.backupInterval);
    
    this.timers.set('backup', timer);
    console.log(`[CookieAutomation] Backup timer started (${this.config.backupInterval}ms interval)`);
  }

  /**
   * Create backup
   */
  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `./backups/cookies-${timestamp}`;
      
      await this.backupCookies(backupPath);
      
      console.log(`[CookieAutomation] Backup created at ${backupPath}`);
      this.emit('backupCreated', { path: backupPath });
    } catch (error) {
      console.error('[CookieAutomation] Failed to create backup:', error);
      this.emit('backupFailed', { error });
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const listeners = this.listeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  emit(event, data = {}) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[CookieAutomation] Event listener error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Get managed domains
   */
  async getManagedDomains() {
    // This should be implemented by the storage layer
    // For now, return empty array
    return [];
  }

  /**
   * Get cookies for domain
   */
  async getCookies(domain) {
    // This should be implemented by the storage layer
    return [];
  }

  /**
   * Validate cookies
   */
  async validateCookies(domain, cookies) {
    // This should be implemented by the validator
    return {
      isValid: false,
      isExpired: true,
      hasSessionCookie: false,
      validCookies: 0,
      totalCookies: cookies.length,
      expiresAt: null,
      warnings: []
    };
  }

  /**
   * Perform actual refresh
   */
  async performRefresh(domain) {
    // This should be implemented by the manager
    // For now, return false
    return false;
  }

  /**
   * Backup cookies
   */
  async backupCookies(backupPath) {
    // This should be implemented by the storage layer
    // For now, just create directory
    const fs = await import('fs-extra');
    await fs.ensureDir(backupPath);
  }

  /**
   * Get automation status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      timers: Array.from(this.timers.keys()),
      listeners: Array.from(this.listeners.keys())
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Restart timers if running
    if (this.isRunning) {
      this.stopAutoRefresh();
      this.startAutoRefresh();
    }
    
    console.log('[CookieAutomation] Configuration updated');
  }
}