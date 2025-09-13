/**
 * Cookie管理器
 * 基于xiaohongshu-mcp的Cookie管理模式，支持按域名分类存储和加密
 */

import { BaseBrowserModule } from '../core/BaseModule';
import { BrowserAssistantError } from '../errors';
import { CamoufoxContext } from './CamoufoxManager';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface EncryptedCookieData extends CookieData {
  encryptedValue: string;
  iv: string;
  authTag: string;
}

export interface CookieStorage {
  domain: string;
  cookies: EncryptedCookieData[];
  timestamp: number;
}

/**
 * Cookie管理器
 * 提供Cookie的加密存储、按域名管理和自动加载功能
 */
export class CookieManager extends BaseBrowserModule {
  private cookieStorage: Map<string, EncryptedCookieData[]> = new Map();
  private encryptionKey: string;
  private storagePath: string;
  private algorithm: string = 'aes-256-gcm';

  constructor(
    encryptionKey?: string,
    storagePath: string = './cookies/'
  ) {
    super('CookieManager');
    this.encryptionKey = encryptionKey || 'default-encryption-key-32bytes-long';
    this.storagePath = storagePath;
  }

  /**
   * 初始化Cookie管理器
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // 确保存储目录存在
    await this.ensureStorageDirectory();
    
    // 加载已保存的Cookie
    await this.loadPersistedCookies();
    
    this.getLogger().info('CookieManager initialized');
  }

  /**
   * 加载Cookie到浏览器上下文 - 按域名
   */
  async loadCookies(context: CamoufoxContext, domain?: string): Promise<void> {
    try {
      if (domain) {
        // 加载指定域名的Cookie
        const cookies = await this.loadDomainCookies(domain);
        if (cookies.length > 0) {
          const decrypted = cookies.map(cookie => this.decryptCookie(cookie));
          await context.addCookies(decrypted);
          this.getLogger().info(`Loaded ${cookies.length} cookies for domain: ${domain}`);
        }
      } else {
        // 加载所有Cookie
        const totalLoaded = await this.loadAllCookies(context);
        this.getLogger().info(`Loaded ${totalLoaded} cookies from storage`);
      }
    } catch (error) {
      this.getLogger().warn(`Failed to load cookies: ${error.message}`);
    }
  }

  /**
   * 保存Cookie - 按域名分类
   */
  async saveCookies(page: any): Promise<void> {
    try {
      const cookies = await page.context().cookies();
      
      if (cookies.length === 0) {
        this.getLogger().debug('No cookies to save');
        return;
      }
      
      // 按域名分组
      const domainGroups = this.groupCookiesByDomain(cookies);
      let totalSaved = 0;
      
      // 加密并保存每个域名的Cookie
      for (const [domain, domainCookies] of domainGroups) {
        const encrypted = domainCookies.map(cookie => this.encryptCookie(cookie));
        this.cookieStorage.set(domain, encrypted);
        
        // 持久化到文件系统
        await this.persistCookies(domain, encrypted);
        totalSaved += encrypted.length;
      }
      
      this.getLogger().info(`Saved ${totalSaved} cookies for ${domainGroups.size} domains`);
      
    } catch (error) {
      this.getLogger().error(`Failed to save cookies: ${error.message}`);
    }
  }

  /**
   * 获取指定域名的Cookie
   */
  async getDomainCookies(domain: string): Promise<CookieData[]> {
    const encrypted = this.cookieStorage.get(domain) || [];
    return encrypted.map(cookie => this.decryptCookie(cookie));
  }

  /**
   * 设置指定域名的Cookie
   */
  async setDomainCookies(domain: string, cookies: CookieData[]): Promise<void> {
    const encrypted = cookies.map(cookie => this.encryptCookie(cookie));
    this.cookieStorage.set(domain, encrypted);
    await this.persistCookies(domain, encrypted);
    this.getLogger().info(`Set ${cookies.length} cookies for domain: ${domain}`);
  }

  /**
   * 清除指定域名的Cookie
   */
  async clearDomainCookies(domain: string): Promise<void> {
    this.cookieStorage.delete(domain);
    await this.removePersistedCookies(domain);
    this.getLogger().info(`Cleared cookies for domain: ${domain}`);
  }

  /**
   * 清除所有Cookie
   */
  async clearAllCookies(): Promise<void> {
    const domains = Array.from(this.cookieStorage.keys());
    
    for (const domain of domains) {
      await this.clearDomainCookies(domain);
    }
    
    this.getLogger().info('Cleared all cookies');
  }

  /**
   * 检查是否有指定域名的Cookie
   */
  hasDomainCookies(domain: string): boolean {
    const cookies = this.cookieStorage.get(domain);
    return cookies ? cookies.length > 0 : false;
  }

  /**
   * 获取所有域名列表
   */
  getDomains(): string[] {
    return Array.from(this.cookieStorage.keys());
  }

  /**
   * 获取Cookie统计信息
   */
  getCookieStats(): {
    totalDomains: number;
    totalCookies: number;
    domainStats: Array<{ domain: string; count: number }>;
  } {
    const domainStats = Array.from(this.cookieStorage.entries()).map(([domain, cookies]) => ({
      domain,
      count: cookies.length
    }));

    return {
      totalDomains: this.cookieStorage.size,
      totalCookies: domainStats.reduce((sum, stat) => sum + stat.count, 0),
      domainStats: domainStats.sort((a, b) => b.count - a.count)
    };
  }

  /**
   * 导出Cookie数据
   */
  async exportCookies(domain?: string): Promise<CookieStorage[]> {
    const result: CookieStorage[] = [];
    
    if (domain) {
      const cookies = this.cookieStorage.get(domain);
      if (cookies) {
        result.push({
          domain,
          cookies,
          timestamp: Date.now()
        });
      }
    } else {
      for (const [domain, cookies] of this.cookieStorage) {
        result.push({
          domain,
          cookies,
          timestamp: Date.now()
        });
      }
    }
    
    return result;
  }

  /**
   * 导入Cookie数据
   */
  async importCookies(storages: CookieStorage[]): Promise<void> {
    let totalImported = 0;
    
    for (const storage of storages) {
      this.cookieStorage.set(storage.domain, storage.cookies);
      await this.persistCookies(storage.domain, storage.cookies);
      totalImported += storage.cookies.length;
    }
    
    this.getLogger().info(`Imported ${totalImported} cookies for ${storages.length} domains`);
  }

  /**
   * 加载指定域名的Cookie
   */
  private async loadDomainCookies(domain: string): Promise<EncryptedCookieData[]> {
    // 首先从内存中获取
    const memoryCookies = this.cookieStorage.get(domain);
    if (memoryCookies) {
      return memoryCookies;
    }
    
    // 然后从文件中加载
    try {
      const filePath = this.getCookieFilePath(domain);
      const data = await fs.readFile(filePath, 'utf-8');
      const storage: CookieStorage = JSON.parse(data);
      
      this.cookieStorage.set(domain, storage.cookies);
      return storage.cookies;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.getLogger().warn(`Failed to load cookies for ${domain}: ${error.message}`);
      }
      return [];
    }
  }

  /**
   * 加载所有Cookie到浏览器上下文
   */
  private async loadAllCookies(context: CamoufoxContext): Promise<number> {
    let totalLoaded = 0;
    
    for (const [domain, encryptedCookies] of this.cookieStorage) {
      if (encryptedCookies.length > 0) {
        const decrypted = encryptedCookies.map(cookie => this.decryptCookie(cookie));
        await context.addCookies(decrypted);
        totalLoaded += decrypted.length;
      }
    }
    
    return totalLoaded;
  }

  /**
   * 加载持久化的Cookie
   */
  private async loadPersistedCookies(): Promise<void> {
    try {
      const files = await fs.readdir(this.storagePath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const domain = file.replace('.json', '');
          await this.loadDomainCookies(domain);
        }
      }
      
      this.getLogger().debug(`Loaded cookies from ${files.length} files`);
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.getLogger().warn(`Failed to load persisted cookies: ${error.message}`);
      }
    }
  }

  /**
   * 按域名分组Cookie
   */
  private groupCookiesByDomain(cookies: any[]): Map<string, CookieData[]> {
    const groups = new Map<string, CookieData[]>();
    
    for (const cookie of cookies) {
      const domain = cookie.domain || '';
      if (!groups.has(domain)) {
        groups.set(domain, []);
      }
      groups.get(domain)!.push(cookie);
    }
    
    return groups;
  }

  /**
   * 加密Cookie
   */
  private encryptCookie(cookie: CookieData): EncryptedCookieData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
    
    let encrypted = cipher.update(cookie.value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      ...cookie,
      encryptedValue: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * 解密Cookie
   */
  private decryptCookie(encrypted: EncryptedCookieData): CookieData {
    const decipher = crypto.createDecipher(
      this.algorithm,
      this.encryptionKey
    );
    
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted.encryptedValue, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    const { encryptedValue, iv, authTag, ...cookie } = encrypted;
    return {
      ...cookie,
      value: decrypted
    };
  }

  /**
   * 持久化Cookie到文件
   */
  private async persistCookies(domain: string, cookies: EncryptedCookieData[]): Promise<void> {
    try {
      const filePath = this.getCookieFilePath(domain);
      const storage: CookieStorage = {
        domain,
        cookies,
        timestamp: Date.now()
      };
      
      await fs.writeFile(filePath, JSON.stringify(storage, null, 2));
      this.getLogger().debug(`Persisted cookies for domain: ${domain}`);
      
    } catch (error) {
      this.getLogger().warn(`Failed to persist cookies for ${domain}: ${error.message}`);
    }
  }

  /**
   * 移除持久化的Cookie文件
   */
  private async removePersistedCookies(domain: string): Promise<void> {
    try {
      const filePath = this.getCookieFilePath(domain);
      await fs.unlink(filePath);
      this.getLogger().debug(`Removed persisted cookies for domain: ${domain}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.getLogger().warn(`Failed to remove persisted cookies for ${domain}: ${error.message}`);
      }
    }
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new BrowserAssistantError(`Failed to create storage directory: ${error.message}`);
      }
    }
  }

  /**
   * 获取Cookie文件路径
   */
  private getCookieFilePath(domain: string): string {
    // 确保域名文件名安全
    const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.storagePath, `${safeDomain}.json`);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.cookieStorage.clear();
    await super.cleanup();
    this.getLogger().info('CookieManager cleaned up');
  }
}