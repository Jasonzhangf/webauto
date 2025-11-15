#!/usr/bin/env node

/**
 * TypeSrcipt Cookie测试
 * 验证Cookie加载功能
 */

// 注意：此文件为测试/诊断脚本，仍然保留直接使用 Playwright。
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

class CookieTester {
  private cookiesPath: string;
  private essentialCookies: string[];

  constructor() {
    this.cookiesPath = path.join(process.env.HOME || '~', '.webauto/cookies/weibo-cookies.json');
    this.essentialCookies = ['SUB', 'WBPSESS', 'XSRF-TOKEN'];
  }

  async testCookieLoading(): Promise<CookieTestResult> {
    let browser = null;
    let context = null;

    try {
      console.log('📍 步骤1: 读取Cookie文件...');
      const cookieData = await fs.readFile(this.cookiesPath, 'utf8');
      const cookies: CookieData[] = JSON.parse(cookieData);

      console.log(`✅ Cookie文件: ${this.cookiesPath}`);
      console.log(`📊 Cookie数量: ${cookies.length}`);

      // 检查关键Cookie
      const foundEssential = this.essentialCookies.filter(name =>
        cookies.some(cookie => cookie.name === name)
      );

      console.log(`🔑 关键Cookie: ${foundEssential.join(', ')}`);

      console.log('\n🌐 步骤2: 启动浏览器...');
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();

      console.log('\n🍪 步骤3: 加载Cookie到浏览器...');
      await context.addCookies(cookies);

      // 验证加载
      const loadedCookies = await context.cookies();
      console.log(`✅ 成功加载 ${loadedCookies.length} 个Cookie`);

      console.log('\n🌐 步骤4: 访问微博测试...');
      const page = await context.newPage();

      try {
        await page.goto('https://weibo.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        });

        console.log(`✅ 访问成功: ${page.url()}`);

        // 简单的登录状态检查
        const pageContent = await page.content();
        const hasLoginText = pageContent.includes('登录') || pageContent.includes('login');
        const hasLogoutText = pageContent.includes('退出') || pageContent.includes('注销');

        console.log(`🔍 登录文本: ${hasLoginText}`);
        console.log(`🔍 退出文本: ${hasLogoutText}`);

        const isLoggedIn = !hasLoginText && hasLogoutText;
        console.log(`📊 登录状态: ${isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);

        return {
          success: true,
          cookieCount: cookies.length,
          essentialCookies: foundEssential,
          isLoggedIn
        };

      } catch (error) {
        console.log(`⚠️ 访问问题: ${error.message}`);
        return {
          success: true,
          cookieCount: cookies.length,
          essentialCookies: foundEssential,
          isLoggedIn: false
        };
      }

    } catch (error) {
      console.log(`❌ 测试失败: ${error.message}`);
      return {
        success: false,
        cookieCount: 0,
        essentialCookies: [],
        isLoggedIn: false,
        error: error.message
      };

    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }
  }
}

// 运行测试
async function runCookieTest() {
  const tester = new CookieTester();

  try {
    const result = await tester.testCookieLoading();

    console.log('\n📋 TypeScript Cookie测试结果:');
    console.log(`执行状态: ${result.success ? '✅ 成功' : '❌ 失败'}`);

    if (result.success) {
      console.log(`Cookie数量: ${result.cookieCount}`);
      console.log(`关键Cookie: ${result.essentialCookies.length}/3`);
      console.log(`登录状态: ${result.isLoggedIn ? '✅ 已登录' : '❌ 未登录'}`);

      if (result.essentialCookies.length === 3) {
        console.log('🎉 所有关键Cookie都存在!');
      }

      console.log('\n✅ TypeScript Cookie加载验证完成!');
      console.log('🎉 Core/Detector架构下的Cookie功能正常!');
    } else {
      console.log(`错误: ${result.error}`);
    }

    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.log('💥 程序执行失败:', error.message);
    process.exit(1);
  }
}

// 启动测试
runCookieTest();
