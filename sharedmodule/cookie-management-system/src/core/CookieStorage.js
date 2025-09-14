/**
 * Cookie Storage Implementation
 */

import fs from 'fs-extra';
import path from 'path';
import { ICookieStorage } from '../interfaces/CookieInterfaces.js';

export class CookieStorage extends ICookieStorage {
  constructor(storagePath = './cookies') {
    super();
    this.storagePath = storagePath;
    this.cache = new Map();
    this.stats = {
      totalDomains: 0,
      totalCookies: 0,
      domainStats: {},
      lastCleanup: new Date()
    };
  }

  /**
   * Initialize storage
   */
  async initialize() {
    try {
      await fs.ensureDir(this.storagePath);
      console.log(`[CookieStorage] Storage initialized at ${this.storagePath}`);
    } catch (error) {
      console.error('[CookieStorage] Failed to initialize storage:', error);
      throw error;
    }
  }

  /**
   * Store cookies for a domain
   */
  async storeCookies(domain, cookies) {
    try {
      if (!Array.isArray(cookies)) {
        throw new Error('Cookies must be an array');
      }

      const cookieFile = path.join(this.storagePath, `${domain}.json`);
      
      // Encrypt cookies if needed
      const processedCookies = cookies.map(cookie => ({
        ...cookie,
        storedAt: Date.now()
      }));

      await fs.writeJSON(cookieFile, processedCookies, { spaces: 2 });
      
      // Update cache
      this.cache.set(domain, processedCookies);
      
      // Update stats
      this.updateStats(domain, processedCookies);
      
      console.log(`[CookieStorage] Stored ${processedCookies.length} cookies for ${domain}`);
      return true;
    } catch (error) {
      console.error(`[CookieStorage] Failed to store cookies for ${domain}:`, error);
      return false;
    }
  }

  /**
   * Load cookies for a domain
   */
  async loadCookies(domain) {
    try {
      // Check cache first
      if (this.cache.has(domain)) {
        return this.cache.get(domain);
      }

      const cookieFile = path.join(this.storagePath, `${domain}.json`);
      
      if (!await fs.pathExists(cookieFile)) {
        console.log(`[CookieStorage] No cookie file found for ${domain}`);
        return [];
      }

      const cookies = await fs.readJSON(cookieFile);
      
      // Filter out expired cookies
      const validCookies = this.filterExpiredCookies(cookies);
      
      // Update cache
      this.cache.set(domain, validCookies);
      
      console.log(`[CookieStorage] Loaded ${validCookies.length} cookies for ${domain}`);
      return validCookies;
    } catch (error) {
      console.error(`[CookieStorage] Failed to load cookies for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Delete cookies for a domain
   */
  async deleteCookies(domain) {
    try {
      const cookieFile = path.join(this.storagePath, `${domain}.json`);
      
      if (await fs.pathExists(cookieFile)) {
        await fs.remove(cookieFile);
      }
      
      // Remove from cache
      this.cache.delete(domain);
      
      // Update stats
      if (this.stats.domainStats[domain]) {
        this.stats.totalCookies -= this.stats.domainStats[domain];
        delete this.stats.domainStats[domain];
        this.stats.totalDomains--;
      }
      
      console.log(`[CookieStorage] Deleted cookies for ${domain}`);
      return true;
    } catch (error) {
      console.error(`[CookieStorage] Failed to delete cookies for ${domain}:`, error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * List all domains with stored cookies
   */
  async listDomains() {
    try {
      const files = await fs.readdir(this.storagePath);
      const domains = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
      
      return domains;
    } catch (error) {
      console.error('[CookieStorage] Failed to list domains:', error);
      return [];
    }
  }

  /**
   * Clean up expired cookies
   */
  async cleanupExpiredCookies() {
    try {
      const domains = await this.listDomains();
      let totalCleaned = 0;

      for (const domain of domains) {
        const cookies = await this.loadCookies(domain);
        const validCookies = this.filterExpiredCookies(cookies);
        
        if (validCookies.length !== cookies.length) {
          await this.storeCookies(domain, validCookies);
          totalCleaned += cookies.length - validCookies.length;
        }
      }

      this.stats.lastCleanup = new Date();
      console.log(`[CookieStorage] Cleaned up ${totalCleaned} expired cookies`);
      return totalCleaned;
    } catch (error) {
      console.error('[CookieStorage] Failed to cleanup expired cookies:', error);
      return 0;
    }
  }

  /**
   * Backup cookies
   */
  async backup(backupPath) {
    try {
      await fs.copy(this.storagePath, backupPath);
      console.log(`[CookieStorage] Cookies backed up to ${backupPath}`);
      return true;
    } catch (error) {
      console.error('[CookieStorage] Failed to backup cookies:', error);
      return false;
    }
  }

  /**
   * Restore cookies from backup
   */
  async restore(backupPath) {
    try {
      await fs.copy(backupPath, this.storagePath);
      this.cache.clear(); // Clear cache to force reload
      console.log(`[CookieStorage] Cookies restored from ${backupPath}`);
      return true;
    } catch (error) {
      console.error('[CookieStorage] Failed to restore cookies:', error);
      return false;
    }
  }

  /**
   * Filter out expired cookies
   */
  filterExpiredCookies(cookies) {
    const now = Date.now();
    return cookies.filter(cookie => {
      if (cookie.expires === -1) return true; // Session cookie
      if (cookie.expires === 0) return false; // Expired
      return cookie.expires * 1000 > now; // Check expiration
    });
  }

  /**
   * Update statistics
   */
  updateStats(domain, cookies) {
    const oldCount = this.stats.domainStats[domain] || 0;
    const newCount = cookies.length;
    
    this.stats.domainStats[domain] = newCount;
    this.stats.totalCookies = this.stats.totalCookies - oldCount + newCount;
    
    if (oldCount === 0 && newCount > 0) {
      this.stats.totalDomains++;
    }
  }
}