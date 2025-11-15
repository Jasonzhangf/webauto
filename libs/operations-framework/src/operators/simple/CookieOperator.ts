/**
 * WebAuto Workflow Engine - Simple Cookie Operator
 * @package @webauto/workflow-engine
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { UniversalOperator, OperationResult, OperatorConfig } from '../../workflow/types/WorkflowTypes';

export interface CookieParams {
  action: 'save' | 'load' | 'clear' | 'set' | 'get' | 'delete';
  path?: string;
  cookies?: any[];
  domain?: string;
  name?: string;
  value?: string;
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}

export class CookieOperator implements UniversalOperator {
  public config: OperatorConfig;
  private _cookieStore: Map<string, CookieData[]> = new Map();
  private _currentCookies: CookieData[] = [];

  constructor() {
    this.config = {
      id: 'cookie',
      name: 'Cookie Operator',
      type: 'cookie',
      description: 'Manages browser cookies for session persistence',
      version: '1.0.0',
      parameters: [
        {
          name: 'action',
          type: 'string',
          required: true,
          description: 'Action to perform: save, load, clear, set, get, delete'
        },
        {
          name: 'path',
          type: 'string',
          required: false,
          description: 'File path for save/load operations'
        },
        {
          name: 'cookies',
          type: 'array',
          required: false,
          description: 'Array of cookie objects for set operation'
        },
        {
          name: 'domain',
          type: 'string',
          required: false,
          description: 'Domain filter for cookie operations'
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Cookie name for get/delete operations'
        },
        {
          name: 'value',
          type: 'string',
          required: false,
          description: 'Cookie value for set operation'
        }
      ]
    };
  }

  async execute(params: CookieParams): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      switch (params.action) {
        case 'save':
          return await this.saveCookies(params.path || './cookies.json');
        case 'load':
          return await this.loadCookies(params.path || './cookies.json');
        case 'clear':
          return await this.clearCookies(params.domain);
        case 'set':
          return await this.setCookie(params.name!, params.value!, params.domain);
        case 'get':
          return await this.getCookie(params.name!, params.domain);
        case 'delete':
          return await this.deleteCookie(params.name!, params.domain);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime
      };
    }
  }

  validate(params: CookieParams): boolean {
    if (!params.action || !['save', 'load', 'clear', 'set', 'get', 'delete'].includes(params.action)) {
      return false;
    }

    if (['save', 'load'].includes(params.action) && !params.path) {
      return false;
    }

    if (params.action === 'set' && (!params.name || !params.value)) {
      return false;
    }

    if (['get', 'delete'].includes(params.action) && !params.name) {
      return false;
    }

    if (params.domain && typeof params.domain !== 'string') {
      return false;
    }

    if (params.cookies && !Array.isArray(params.cookies)) {
      return false;
    }

    return true;
  }

  getCapabilities(): string[] {
    return ['cookie-management', 'session-persistence', 'domain-filtering'];
  }

  private async saveCookies(filePath: string): Promise<OperationResult> {
    try {
      const absolutePath = path.resolve(filePath);
      const dirPath = path.dirname(absolutePath);

      // Create directory if it doesn't exist
      await fs.mkdir(dirPath, { recursive: true });

      // Prepare cookies for saving
      const cookiesToSave = this._currentCookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite
      }));

      const content = JSON.stringify({
        cookies: cookiesToSave,
        savedAt: Date.now(),
        version: '1.0'
      }, null, 2);

      await fs.writeFile(absolutePath, content, 'utf-8');

      return {
        success: true,
        data: {
          message: `Cookies saved to ${filePath}`,
          path: absolutePath,
          count: cookiesToSave.length
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  private async loadCookies(filePath: string): Promise<OperationResult> {
    try {
      const absolutePath = path.resolve(filePath);

      // Check if file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return {
          success: false,
          error: `Cookie file not found: ${filePath}`,
          duration: Date.now() - startTime
        };
      }

      const content = await fs.readFile(absolutePath, 'utf-8');
      const data = JSON.parse(content);

      if (!data.cookies || !Array.isArray(data.cookies)) {
        throw new Error('Invalid cookie file format');
      }

      // Load cookies into memory
      this._currentCookies = data.cookies.map((cookie: any) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'lax'
      }));

      // Group by domain
      this._cookieStore.clear();
      for (const cookie of this._currentCookies) {
        if (!this._cookieStore.has(cookie.domain)) {
          this._cookieStore.set(cookie.domain, []);
        }
        this._cookieStore.get(cookie.domain)!.push(cookie);
      }

      return {
        success: true,
        data: {
          message: `Cookies loaded from ${filePath}`,
          path: absolutePath,
          count: this._currentCookies.length,
          domains: Array.from(this._cookieStore.keys())
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  private async clearCookies(domain?: string): Promise<OperationResult> {
    let clearedCount = 0;

    if (domain) {
      // Clear cookies for specific domain
      const cookies = this._cookieStore.get(domain);
      if (cookies) {
        clearedCount = cookies.length;
        this._cookieStore.delete(domain);
        this._currentCookies = this._currentCookies.filter(c => c.domain !== domain);
      }
    } else {
      // Clear all cookies
      clearedCount = this._currentCookies.length;
      this._cookieStore.clear();
      this._currentCookies = [];
    }

    return {
      success: true,
      data: {
        message: `Cleared ${clearedCount} cookies`,
        clearedCount,
        domain: domain || 'all'
      },
      duration: Date.now() - startTime
    };
  }

  private async setCookie(name: string, value: string, domain?: string): Promise<OperationResult> {
    const cookie: CookieData = {
      name,
      value,
      domain: domain || 'default',
      path: '/',
      secure: false,
      httpOnly: false,
      sameSite: 'lax'
    };

    // Check if cookie already exists
    const existingIndex = this._currentCookies.findIndex(c =>
      c.name === name && c.domain === cookie.domain
    );

    if (existingIndex >= 0) {
      // Update existing cookie
      this._currentCookies[existingIndex] = cookie;
    } else {
      // Add new cookie
      this._currentCookies.push(cookie);
    }

    // Update domain store
    if (!this._cookieStore.has(cookie.domain)) {
      this._cookieStore.set(cookie.domain, []);
    }

    const domainCookies = this._cookieStore.get(cookie.domain)!;
    const existingDomainIndex = domainCookies.findIndex(c => c.name === name);

    if (existingDomainIndex >= 0) {
      domainCookies[existingDomainIndex] = cookie;
    } else {
      domainCookies.push(cookie);
    }

    return {
      success: true,
      data: {
        message: `Cookie set: ${name}`,
        cookie
      },
      duration: Date.now() - startTime
    };
  }

  private async getCookie(name: string, domain?: string): Promise<OperationResult> {
    let cookie = this._currentCookies.find(c =>
      c.name === name && (!domain || c.domain === domain)
    );

    if (!cookie) {
      return {
        success: false,
        error: `Cookie not found: ${name}`,
        duration: Date.now() - startTime
      };
    }

    return {
      success: true,
      data: {
        message: `Cookie found: ${name}`,
        cookie
      },
      duration: Date.now() - startTime
    };
  }

  private async deleteCookie(name: string, domain?: string): Promise<OperationResult> {
    const initialCount = this._currentCookies.length;

    // Remove from current cookies
    this._currentCookies = this._currentCookies.filter(c =>
      !(c.name === name && (!domain || c.domain === domain))
    );

    // Remove from domain store
    if (domain) {
      const domainCookies = this._cookieStore.get(domain);
      if (domainCookies) {
        this._cookieStore.set(domain, domainCookies.filter(c => c.name !== name));
      }
    } else {
      // Remove from all domains
      for (const [domainKey, cookies] of this._cookieStore.entries()) {
        this._cookieStore.set(domainKey, cookies.filter(c => c.name !== name));
      }
    }

    const deletedCount = initialCount - this._currentCookies.length;

    return {
      success: true,
      data: {
        message: `Cookie deleted: ${name}`,
        deletedCount,
        domain: domain || 'all'
      },
      duration: Date.now() - startTime
    };
  }

  // Additional utility methods
  async getAllCookies(domain?: string): Promise<OperationResult> {
    let cookies = this._currentCookies;

    if (domain) {
      cookies = cookies.filter(c => c.domain === domain);
    }

    return {
      success: true,
      data: {
        message: `Retrieved ${cookies.length} cookies`,
        cookies,
        domain: domain || 'all'
      },
      duration: Date.now() - startTime
    };
  }

  async getDomains(): Promise<OperationResult> {
    const domains = Array.from(this._cookieStore.keys());

    return {
      success: true,
      data: {
        message: `Found ${domains.length} domains`,
        domains,
        domainStats: domains.map(domain => ({
          domain,
          cookieCount: this._cookieStore.get(domain)?.length || 0
        }))
      },
      duration: Date.now() - startTime
    };
  }

  async exportCookies(filePath: string, format: 'json' | 'netscape' = 'json'): Promise<OperationResult> {
    try {
      const absolutePath = path.resolve(filePath);
      const dirPath = path.dirname(absolutePath);

      await fs.mkdir(dirPath, { recursive: true });

      let content: string;

      if (format === 'json') {
        content = JSON.stringify({
          cookies: this._currentCookies,
          exportedAt: Date.now(),
          version: '1.0'
        }, null, 2);
      } else if (format === 'netscape') {
        content = this.convertToNetscapeFormat();
      } else {
        throw new Error(`Unsupported format: ${format}`);
      }

      await fs.writeFile(absolutePath, content, 'utf-8');

      return {
        success: true,
        data: {
          message: `Cookies exported to ${filePath}`,
          path: absolutePath,
          format,
          count: this._currentCookies.length
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  private convertToNetscapeFormat(): string {
    const lines = ['# Netscape HTTP Cookie File', '# This is a generated file! Do not edit.'];

    for (const cookie of this._currentCookies) {
      const domain = cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`;
      const flag = cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const path = cookie.path || '/';
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const expires = cookie.expires || Math.floor(Date.now() / 1000) + 86400; // 1 day from now

      lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expires}\t${cookie.name}\t${cookie.value}`);
    }

    return lines.join('\n');
  }
}