
/**
 * TypeSrcipt Cookie测试
 * 验证Cookie加载功能
 */

import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

console.log('🍪 TypeScript Cookie测试...\n');

interface CookieTestResult {
  success: boolean;
  cookieCount: number;
  essentialCookies: string[];
  isLoggedIn: boolean;
  error?: string;
}

interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}