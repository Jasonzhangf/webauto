/**
 * Universal Cookie Manager for WebAuto Operations Framework
 * Supports configurable cookie paths and centralized cookie management
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class UniversalCookieManager {
  constructor(options = {}) {
    this.basePath = options.basePath || path.join(os.homedir(), '.webauto');
    this.cookiesPath = options.cookiesPath || path.join(this.basePath, 'cookies');
    this.defaultCookieFile = options.defaultCookieFile || 'default-cookies.json';
    this.domainMappings = options.domainMappings || {
      'weibo.com': 'weibo-cookies.json',
      'www.weibo.com': 'weibo-cookies.json',
      'weibo.cn': 'weibo-cookies.json'
    };
    this.cookieCache = new Map();
  }

  /**
   * Get cookie file path for a specific domain
   */
  getCookiePath(domain, customPath = null) {
    if (customPath) {
      // If custom path is absolute, use it directly
      if (path.isAbsolute(customPath)) {
        return customPath;
      }
      // If custom path is relative, resolve relative to cookies directory
      return path.join(this.cookiesPath, customPath);
    }

    // Use domain mapping or default
    const fileName = this.domainMappings[domain] || this.defaultCookieFile;
    return path.join(this.cookiesPath, fileName);
  }

  /**
   * Ensure cookies directory exists
   */
  async ensureDirectory() {
    try {
      await fs.mkdir(this.cookiesPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Load cookies from file
   */
  async loadCookies(domainOrPath, options = {}) {
    await this.ensureDirectory();

    const cookiePath = this.getCookiePath(domainOrPath, options.customPath);
    const cacheKey = options.cacheKey || domainOrPath;

    // Check cache first
    if (options.useCache !== false && this.cookieCache.has(cacheKey)) {
      return this.cookieCache.get(cacheKey);
    }

    try {
      console.log(`🍪 Loading cookies from ${cookiePath}...`);

      if (!await this.fileExists(cookiePath)) {
        console.warn(`⚠️ Cookie file not found: ${cookiePath}`);
        return [];
      }

      const cookieData = await fs.readFile(cookiePath, 'utf-8');
      let cookies;

      try {
        const parsed = JSON.parse(cookieData);
        // Handle both array format and object format with cookies property
        cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
      } catch (parseError) {
        console.warn(`⚠️ Failed to parse cookie file ${cookiePath}: ${parseError.message}`);
        return [];
      }

      console.log(`✅ Loaded ${cookies.length} cookies from ${cookiePath}`);

      // Cache the result
      if (options.useCache !== false) {
        this.cookieCache.set(cacheKey, cookies);
      }

      return cookies;

    } catch (error) {
      console.error(`❌ Failed to load cookies from ${cookiePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Save cookies to file
   */
  async saveCookies(cookies, domainOrPath, options = {}) {
    await this.ensureDirectory();

    const cookiePath = this.getCookiePath(domainOrPath, options.customPath);
    const cacheKey = options.cacheKey || domainOrPath;

    try {
      console.log(`💾 Saving ${cookies.length} cookies to ${cookiePath}...`);

      const cookieData = {
        cookies: cookies,
        savedAt: Date.now(),
        version: '1.0',
        domain: domainOrPath
      };

      await fs.writeFile(cookiePath, JSON.stringify(cookieData, null, 2));

      // Update cache
      this.cookieCache.set(cacheKey, cookies);

      console.log(`✅ Cookies saved successfully to ${cookiePath}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to save cookies to ${cookiePath}: ${error.message}`);
      return false;
    }
  }

  /**
   * Merge cookies with existing ones
   */
  async mergeCookies(newCookies, domainOrPath, options = {}) {
    const existingCookies = await this.loadCookies(domainOrPath, options);

    // Create a map of existing cookies by name and domain
    const cookieMap = new Map();
    existingCookies.forEach(cookie => {
      const key = `${cookie.name}|${cookie.domain}`;
      cookieMap.set(key, cookie);
    });

    // Add or update cookies
    newCookies.forEach(cookie => {
      const key = `${cookie.name}|${cookie.domain}`;
      cookieMap.set(key, cookie);
    });

    const mergedCookies = Array.from(cookieMap.values());
    return await this.saveCookies(mergedCookies, domainOrPath, options);
  }

  /**
   * Clear cookies for a domain
   */
  async clearCookies(domainOrPath, options = {}) {
    const cookiePath = this.getCookiePath(domainOrPath, options.customPath);
    const cacheKey = options.cacheKey || domainOrPath;

    try {
      await fs.unlink(cookiePath);
      this.cookieCache.delete(cacheKey);
      console.log(`🧹 Cleared cookies for ${domainOrPath}`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`🧹 No cookies to clear for ${domainOrPath}`);
        return true;
      }
      console.error(`❌ Failed to clear cookies for ${domainOrPath}: ${error.message}`);
      return false;
    }
  }

  /**
   * List available cookie files
   */
  async listCookieFiles() {
    await this.ensureDirectory();

    try {
      const files = await fs.readdir(this.cookiesPath);
      const cookieFiles = files.filter(file => file.endsWith('.json'));

      console.log(`📁 Available cookie files in ${this.cookiesPath}:`);
      cookieFiles.forEach(file => {
        console.log(`   - ${file}`);
      });

      return cookieFiles;
    } catch (error) {
      console.error(`❌ Failed to list cookie files: ${error.message}`);
      return [];
    }
  }

  /**
   * Get cookie summary for a domain
   */
  async getCookieSummary(domainOrPath, options = {}) {
    const cookies = await this.loadCookies(domainOrPath, options);

    const summary = {
      domain: domainOrPath,
      count: cookies.length,
      sessionCookies: 0,
      persistentCookies: 0,
      secureCookies: 0,
      httpOnlyCookies: 0,
      domains: new Set(),
      expires: {
        earliest: null,
        latest: null
      }
    };

    cookies.forEach(cookie => {
      if (cookie.session) {
        summary.sessionCookies++;
      } else {
        summary.persistentCookies++;
      }

      if (cookie.secure) summary.secureCookies++;
      if (cookie.httpOnly) summary.httpOnlyCookies++;
      if (cookie.domain) summary.domains.add(cookie.domain);

      if (cookie.expires && cookie.expires > 0) {
        const expires = new Date(cookie.expires * 1000);
        if (!summary.expires.earliest || expires < summary.expires.earliest) {
          summary.expires.earliest = expires;
        }
        if (!summary.expires.latest || expires > summary.expires.latest) {
          summary.expires.latest = expires;
        }
      }
    });

    summary.domains = Array.from(summary.domains);
    return summary;
  }

  /**
   * Clear cookie cache
   */
  clearCache() {
    this.cookieCache.clear();
    console.log('🧹 Cookie cache cleared');
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Format cookie for browser context
   */
  formatCookiesForBrowser(cookies) {
    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      expires: cookie.expires && cookie.expires > 0 ? Math.floor(cookie.expires) : undefined,
      httpOnly: cookie.httpOnly || false,
      secure: cookie.secure || false,
      sameSite: cookie.sameSite || 'Lax'
    }));
  }
}

module.exports = UniversalCookieManager;