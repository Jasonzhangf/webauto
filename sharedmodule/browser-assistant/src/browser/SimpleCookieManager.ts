/**
 * 简化的Cookie管理器
 * 提供基本的Cookie持久化功能
 */

import { BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export class CookieManager {
  private storagePath: string;
  private cookies: Map<string, CookieData[]> = new Map();

  constructor(storagePath: string = './cookies') {
    this.storagePath = storagePath;
    this.ensureStorageDirectory();
  }

  /**
   * 确保存储目录存在
   */
  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * 检查是否有指定域名的登录Cookie
   */
  hasLoginCookies(domain: string): boolean {
    try {
      const cookieFile = path.join(this.storagePath, `${domain}.json`);
      
      if (fs.existsSync(cookieFile)) {
        const cookieData = fs.readFileSync(cookieFile, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        if (Array.isArray(cookies)) {
          // 检查是否包含关键登录Cookie
          const hasSessionCookies = cookies.some(cookie => 
            cookie.name.toLowerCase().includes('sub') || // 微博会话Cookie
            cookie.name.toLowerCase().includes('srt') || // 登录状态
            cookie.name.toLowerCase().includes('scf') || // 安全认证
            cookie.name.toLowerCase().includes('xsrf') || // CSRF保护
            cookie.name.toLowerCase().includes('csrf')
          );
          
          // 检查Cookie是否过期
          const hasValidCookies = cookies.some(cookie => {
            if (cookie.expires === -1) return true; // 会话Cookie
            if (cookie.expires === 0) return false; // 已过期
            return cookie.expires * 1000 > Date.now(); // 检查过期时间
          });
          
          return hasSessionCookies && hasValidCookies;
        }
      }
      return false;
    } catch (error) {
      console.warn(`[CookieManager] Failed to check login cookies for ${domain}:`, error);
      return false;
    }
  }

  /**
   * 加载指定域名的Cookie
   */
  async loadCookies(context: BrowserContext, domain: string): Promise<boolean> {
    try {
      const cookieFile = path.join(this.storagePath, `${domain}.json`);
      
      if (fs.existsSync(cookieFile)) {
        const cookieData = fs.readFileSync(cookieFile, 'utf8');
        const allCookies = JSON.parse(cookieData);
        
        if (Array.isArray(allCookies)) {
          // 过滤出适用于目标域名的Cookie
          const filteredCookies = allCookies.filter(cookie => {
            const cookieDomain = cookie.domain || '';
            // 检查Cookie域是否匹配目标域名
            return cookieDomain === domain || 
                   cookieDomain === `.${domain}` || 
                   cookieDomain === domain.replace(/^www\./, '') ||
                   cookieDomain === `.${domain.replace(/^www\./, '')}` ||
                   domain.endsWith(cookieDomain.replace(/^\./, '')) ||
                   cookieDomain.endsWith(domain);
          });
          
          if (filteredCookies.length > 0) {
            await context.addCookies(filteredCookies);
            this.cookies.set(domain, filteredCookies);
            console.log(`[CookieManager] Loaded ${filteredCookies.length} cookies for ${domain} (filtered from ${allCookies.length} total)`);
            return true;
          } else {
            console.warn(`[CookieManager] No applicable cookies found for ${domain} in ${allCookies.length} total cookies`);
            return false;
          }
        }
      }
      return false;
    } catch (error) {
      console.warn(`[CookieManager] Failed to load cookies for ${domain}:`, error);
      return false;
    }
  }

  /**
   * 保存当前页面的Cookie
   */
  async saveCookies(page: Page): Promise<void> {
    try {
      const url = page.url();
      if (!url || url === 'about:blank') {
        return;
      }

      const domain = new URL(url).hostname;
      const cookies = await page.context().cookies();
      
      if (cookies.length > 0) {
        this.cookies.set(domain, cookies);
        
        const cookieFile = path.join(this.storagePath, `${domain}.json`);
        fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
        
        console.log(`[CookieManager] Saved ${cookies.length} cookies for ${domain}`);
      }
    } catch (error) {
      console.warn(`[CookieManager] Failed to save cookies:`, error);
    }
  }

  /**
   * 清除所有Cookie
   */
  async clearAllCookies(): Promise<void> {
    try {
      this.cookies.clear();
      
      // 删除所有Cookie文件
      const files = fs.readdirSync(this.storagePath);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.storagePath, file));
        }
      }
      
      console.log('[CookieManager] All cookies cleared');
    } catch (error) {
      console.warn('[CookieManager] Failed to clear cookies:', error);
    }
  }

  /**
   * 获取Cookie统计信息
   */
  getCookieStats(): {
    totalDomains: number;
    totalCookies: number;
    domainStats: Record<string, number>;
  } {
    const domainStats: Record<string, number> = {};
    let totalCookies = 0;

    for (const [domain, cookies] of this.cookies) {
      domainStats[domain] = cookies.length;
      totalCookies += cookies.length;
    }

    return {
      totalDomains: this.cookies.size,
      totalCookies,
      domainStats
    };
  }
}