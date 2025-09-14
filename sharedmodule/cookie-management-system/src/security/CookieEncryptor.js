/**
 * Cookie Encryption Implementation
 */

import crypto from 'crypto';
import { ICookieEncryptor } from '../interfaces/CookieInterfaces.js';

export class CookieEncryptor extends ICookieEncryptor {
  constructor() {
    super();
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.secretKey = null;
  }

  /**
   * Initialize encryption
   */
  async initialize() {
    try {
      // Try to load existing key
      this.secretKey = await this.loadKey();
      
      if (!this.secretKey) {
        // Generate new key
        this.secretKey = crypto.randomBytes(this.keyLength);
        await this.saveKey();
      }
      
      console.log('[CookieEncryptor] Encryption initialized successfully');
    } catch (error) {
      console.error('[CookieEncryptor] Failed to initialize encryption:', error);
      throw error;
    }
  }

  /**
   * Encrypt cookie data
   */
  async encrypt(cookie) {
    if (!this.secretKey) {
      throw new Error('Encryption not initialized');
    }

    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.secretKey);
      
      // Convert cookie to string
      const cookieData = JSON.stringify(cookie);
      
      // Encrypt the data
      let encrypted = cipher.update(cookieData, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.algorithm,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[CookieEncryptor] Failed to encrypt cookie:', error);
      throw error;
    }
  }

  /**
   * Decrypt cookie data
   */
  async decrypt(encryptedCookie) {
    if (!this.secretKey) {
      throw new Error('Encryption not initialized');
    }

    try {
      const decipher = crypto.createDecipher(
        this.algorithm,
        this.secretKey
      );
      
      // Set authentication tag
      decipher.setAuthTag(Buffer.from(encryptedCookie.tag, 'hex'));
      
      // Decrypt the data
      let decrypted = decipher.update(encryptedCookie.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Parse back to object
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('[CookieEncryptor] Failed to decrypt cookie:', error);
      throw error;
    }
  }

  /**
   * Encrypt entire cookie jar
   */
  async encryptCookieJar(cookies) {
    if (!Array.isArray(cookies)) {
      throw new Error('Cookies must be an array');
    }

    const encryptedCookies = [];
    
    for (const cookie of cookies) {
      const encrypted = await this.encrypt(cookie);
      encryptedCookies.push(encrypted);
    }
    
    return encryptedCookies;
  }

  /**
   * Decrypt entire cookie jar
   */
  async decryptCookieJar(encryptedCookies) {
    if (!Array.isArray(encryptedCookies)) {
      throw new Error('Encrypted cookies must be an array');
    }

    const decryptedCookies = [];
    
    for (const encryptedCookie of encryptedCookies) {
      const decrypted = await this.decrypt(encryptedCookie);
      decryptedCookies.push(decrypted);
    }
    
    return decryptedCookies;
  }

  /**
   * Load encryption key
   */
  async loadKey() {
    try {
      // Try to load from environment variable first
      if (process.env.COOKIE_ENCRYPTION_KEY) {
        return Buffer.from(process.env.COOKIE_ENCRYPTION_KEY, 'hex');
      }
      
      // Try to load from key file
      const fs = await import('fs-extra');
      const path = await import('path');
      
      const keyFile = path.join(process.cwd(), '.cookie-key');
      if (await fs.pathExists(keyFile)) {
        const keyData = await fs.readFile(keyFile);
        return Buffer.from(keyData.toString(), 'hex');
      }
      
      return null;
    } catch (error) {
      console.warn('[CookieEncryptor] Failed to load key:', error);
      return null;
    }
  }

  /**
   * Save encryption key
   */
  async saveKey() {
    try {
      const fs = await import('fs-extra');
      const path = await import('path');
      
      const keyFile = path.join(process.cwd(), '.cookie-key');
      await fs.writeFile(keyFile, this.secretKey.toString('hex'));
      
      // Set file permissions (read/write for owner only)
      const fsPromises = await import('fs').then(m => m.promises);
      await fsPromises.chmod(keyFile, 0o600);
      
      console.log('[CookieEncryptor] Encryption key saved successfully');
    } catch (error) {
      console.error('[CookieEncryptor] Failed to save key:', error);
      throw error;
    }
  }

  /**
   * Generate new key
   */
  async generateNewKey() {
    this.secretKey = crypto.randomBytes(this.keyLength);
    await this.saveKey();
    console.log('[CookieEncryptor] New encryption key generated');
  }

  /**
   * Rotate encryption key
   */
  async rotateKey() {
    const oldKey = this.secretKey;
    await this.generateNewKey();
    
    console.log('[CookieEncryptor] Encryption key rotated successfully');
    return oldKey;
  }

  /**
   * Test encryption/decryption
   */
  async testEncryption() {
    const testData = { test: 'data', timestamp: Date.now() };
    
    try {
      const encrypted = await this.encrypt(testData);
      const decrypted = await this.decrypt(encrypted);
      
      const isMatch = JSON.stringify(testData) === JSON.stringify(decrypted);
      
      console.log(`[CookieEncryptor] Test result: ${isMatch ? 'PASSED' : 'FAILED'}`);
      return isMatch;
    } catch (error) {
      console.error('[CookieEncryptor] Test failed:', error);
      return false;
    }
  }

  /**
   * Get encryption info
   */
  getInfo() {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      hasKey: this.secretKey !== null,
      keySize: this.secretKey ? this.secretKey.length : 0
    };
  }
}