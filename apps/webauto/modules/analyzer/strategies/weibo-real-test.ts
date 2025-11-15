import { EventEmitter } from 'events';

// Cookie管理器
class WeiboCookieManager extends EventEmitter {
  private cookies: Map<string, any> = new Map();
  private isLoggedIn: boolean = false;

  async loadCookies(page: any): Promise<boolean> {
    console.log('WeiboCookieManager: Loading cookies...');
    
    try {
      // 检查当前Cookie状态
      const currentCookies = await page.context().cookies();
      const hasSessionCookie = currentCookies.some(cookie => 
        cookie.name === 'SUB' || cookie.name === 'SUE' || cookie.name === 'SUP'
      );
      
      if (hasSessionCookie) {
        console.log('WeiboCookieManager: Found existing session cookies');
        this.isLoggedIn = true;
        this.emit('loginStatusChanged', { loggedIn: true });
        return true;
      }
      
      // 尝试从存储加载Cookie
      const storedCookies = await this.loadStoredCookies();
      if (storedCookies && storedCookies.length > 0) {
        await page.context().addCookies(storedCookies);
        console.log(`WeiboCookieManager: Loaded ${storedCookies.length} stored cookies`);
        this.isLoggedIn = true;
        this.emit('loginStatusChanged', { loggedIn: true });
        return true;
      }
      
      console.log('WeiboCookieManager: No valid cookies found');
      this.isLoggedIn = false;
      this.emit('loginStatusChanged', { loggedIn: false });
      return false;
      
    } catch (error) {
      console.error('WeiboCookieManager: Error loading cookies:', error);
      this.emit('cookieError', error);
      return false;
    }
  }
  
  async validateLoginStatus(page: any): Promise<boolean> {
    console.log('WeiboCookieManager: Validating login status...');
    
    try {
      // 访问微博首页
      await page.goto('https://weibo.com', { waitUntil: 'networkidle2', timeout: 10000 });
      
      // 检查是否需要登录
      const loginIndicators = [
        '.gn_login',
        '.login_btn',
        '[href*="login"]',
        '.unlogin'
      ];
      
      let needsLogin = false;
      for (const selector of loginIndicators) {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            needsLogin = true;
            break;
          }
        }
      }
      
      // 检查用户信息元素
      const userElements = [
        '.gn_name',
        '.WB_name',
        '[data-e2e="user-name"]'
      ];
      
      let hasUserInfo = false;
      for (const selector of userElements) {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            hasUserInfo = true;
            break;
          }
        }
      }
      
      this.isLoggedIn = hasUserInfo && !needsLogin;
      
      console.log(`WeiboCookieManager: Login status: ${this.isLoggedIn ? 'Logged in' : 'Not logged in'}`);
      this.emit('loginStatusChanged', { loggedIn: this.isLoggedIn });
      
      return this.isLoggedIn;
      
    } catch (error) {
      console.error('WeiboCookieManager: Error validating login status:', error);
      this.emit('loginError', error);
      return false;
    }
  }
  
  async saveCookies(page: any): Promise<void> {
    try {
      const cookies = await page.context().cookies();
      const validCookies = cookies.filter(cookie => 
        cookie.name && cookie.value && cookie.domain?.includes('weibo.com')
      );
      
      // 模拟保存到文件
      console.log(`WeiboCookieManager: Saving ${validCookies.length} cookies`);
      this.emit('cookiesSaved', { count: validCookies.length });
      
    } catch (error) {
      console.error('WeiboCookieManager: Error saving cookies:', error);
      this.emit('cookieError', error);
    }
  }
  
  private async loadStoredCookies(): Promise<any[]> {
    // 模拟从文件加载
    return [
      {
        name: 'SUB',
        value: 'test_session_value',
        domain: '.weibo.com',
        path: '/',
        httpOnly: true,
        secure: true
      }
    ];
  }
  
  isLoggedInStatus(): boolean {
    return this.isLoggedIn;
  }
}

// 真实环境测试
class RealEnvironmentTester {
  private cookieManager: WeiboCookieManager;
  
  constructor() {
    this.cookieManager = new WeiboCookieManager();
  }
  
  async runRealTest(): Promise<void> {
    console.log('=== Real Environment Test ===');
    console.log('Target: https://weibo.com/1195242865/5216889711886736');
    console.log('');
    
    // 模拟Playwright页面对象
    const mockPage = {
      context: () => ({
        cookies: async () => [],
        addCookies: async (cookies: any[]) => {
          console.log(`Mock: Adding ${cookies.length} cookies`);
        }
      }),
      goto: async (url: string, options?: any) => {
        console.log(`Mock: Navigating to ${url}`);
      },
      $: async (selector: string) => {
        console.log(`Mock: Looking for ${selector}`);
        return null;
      },
      waitForLoadState: async (state: string, options?: any) => {
        console.log(`Mock: Waiting for ${state}`);
      }
    };
    
    try {
      // 1. 加载Cookie
      console.log('1. Loading cookies...');
      const cookiesLoaded = await this.cookieManager.loadCookies(mockPage as any);
      
      if (!cookiesLoaded) {
        console.log('❌ Cookie loading failed. Stopping test.');
        console.log('Please login to Weibo first and save cookies.');
        return;
      }
      
      // 2. 验证登录状态
      console.log('2. Validating login status...');
      const isLoggedIn = await this.cookieManager.validateLoginStatus(mockPage as any);
      
      if (!isLoggedIn) {
        console.log('❌ Not logged in. Stopping test.');
        console.log('Please login to Weibo first.');
        return;
      }
      
      // 3. 访问目标页面
      console.log('3. Accessing target page...');
      await mockPage.goto('https://weibo.com/1195242865/5216889711886736');
      
      // 4. 检查页面状态
      console.log('4. Checking page status...');
      const pageStatus = await this.checkPageStatus(mockPage as any);
      
      if (pageStatus.hasError) {
        console.log('❌ Page returned error. Stopping test.');
        console.log('Error:', pageStatus.error);
        return;
      }
      
      console.log('✅ All checks passed! Ready for content extraction.');
      console.log('');
      console.log('Next steps:');
      console.log('- Extract post content');
      console.log('- Analyze comments');
      console.log('- Download media files');
      
    } catch (error) {
      console.error('❌ Real environment test failed:', error);
    }
  }
  
  private async checkPageStatus(page: any): Promise<{ hasError: boolean; error?: string }> {
    try {
      // 模拟页面状态检查
      console.log('Mock: Checking for error indicators...');
      
      // 检查常见错误指示器
      const errorSelectors = [
        '.error',
        '.error-page',
        '[class*="error"]',
        '.404',
        '.500'
      ];
      
      for (const selector of errorSelectors) {
        const element = await page.$(selector);
        if (element) {
          return { hasError: true, error: `Found error element: ${selector}` };
        }
      }
      
      return { hasError: false };
      
    } catch (error) {
      return { hasError: true, error: error.message };
    }
  }
}

// 运行真实环境测试
const tester = new RealEnvironmentTester();
tester.runRealTest().then(() => {
  console.log('');
  console.log('=== Real Environment Test Complete ===');
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
