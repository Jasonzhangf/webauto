/**
 * 浏览器控制服务
 * 负责浏览器启动、登录、截图、执行高亮操作
 */
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PageLifecycleMonitor from './page-lifecycle-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BrowserControlService {
  constructor() {
    this.app = express();
    this.app.use(express.json());
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;
    this.cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';

    // 页面生命周期监控器
    this.pageMonitor = null;

    this.setupRoutes();
  }

  setupRoutes() {
    // 启动浏览器并登录
    this.app.post('/start', async (req, res) => {
      try {
        await this.startBrowser();
        await this.login1688();
        res.json({
          success: true,
          message: '浏览器启动并登录成功',
          ready: true
        });
      } catch (error) {
        console.error('启动登录失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 截图
    this.app.post('/screenshot', async (req, res) => {
      try {
        if (!this.page) {
          return res.status(400).json({
            success: false,
            error: '浏览器未启动'
          });
        }

        const screenshot = await this.page.screenshot({
          fullPage: true,
          type: 'png'
        });

        const imageBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;

        res.json({
          success: true,
          screenshot: imageBase64,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('截图失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 执行高亮
    this.app.post('/highlight', async (req, res) => {
      try {
        const { elements } = req.body;

        if (!this.page) {
          return res.status(400).json({
            success: false,
            error: '浏览器未启动'
          });
        }

        if (!elements || !Array.isArray(elements)) {
          return res.status(400).json({
            success: false,
            error: '无效的高亮元素数据'
          });
        }

        await this.executeHighlight(elements);

        res.json({
          success: true,
          message: `成功高亮 ${elements.length} 个元素`,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('高亮失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 清理资源
    this.app.post('/cleanup', async (req, res) => {
      try {
        await this.cleanup();
        res.json({
          success: true,
          message: '浏览器资源已清理'
        });
      } catch (error) {
        console.error('清理失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 获取页面信息
    this.app.get('/pages', async (req, res) => {
      try {
        if (!this.context) {
          return res.status(400).json({
            success: false,
            error: '浏览器未启动'
          });
        }

        const pages = this.context.pages();
        const pageInfo = await Promise.all(pages.map(async (page, index) => {
          const title = await page.title();
          const url = page.url();
          return {
            index,
            title,
            url,
            isCurrent: page === this.page
          };
        }));

        res.json({
          success: true,
          pages: pageInfo,
          total: pages.length,
          current: pages.indexOf(this.page)
        });

      } catch (error) {
        console.error('获取页面信息失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 切换到指定页面
    this.app.post('/switch-page', async (req, res) => {
      try {
        const { pageIndex } = req.body;

        if (!this.context) {
          return res.status(400).json({
            success: false,
            error: '浏览器未启动'
          });
        }

        const pages = this.context.pages();
        if (pageIndex < 0 || pageIndex >= pages.length) {
          return res.status(400).json({
            success: false,
            error: '无效的页面索引'
          });
        }

        this.page = pages[pageIndex];
        await this.page.bringToFront();

        const title = await this.page.title();
        res.json({
          success: true,
          message: `已切换到页面 ${pageIndex + 1}`,
          currentPage: {
            index: pageIndex,
            title,
            url: this.page.url()
          }
        });

      } catch (error) {
        console.error('切换页面失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        status: this.browser ? 'running' : 'stopped',
        isLoggedIn: this.isLoggedIn,
        timestamp: Date.now()
      });
    });

    // 页面监控状态
    this.app.get('/page-monitor-status', (req, res) => {
      if (!this.pageMonitor) {
        return res.json({
          success: true,
          isMonitoring: false,
          message: '页面监控器未初始化',
          timestamp: Date.now()
        });
      }

      const status = this.pageMonitor.getMonitoringStatus();
      res.json({
        success: true,
        ...status,
        timestamp: Date.now()
      });
    });

    // 手动触发页面注入
    this.app.post('/manual-inject', async (req, res) => {
      try {
        const { pageId } = req.body;

        if (!this.pageMonitor) {
          return res.status(400).json({
            success: false,
            error: '页面监控器未初始化'
          });
        }

        if (!pageId) {
          return res.status(400).json({
            success: false,
            error: '缺少pageId参数'
          });
        }

        await this.pageMonitor.manualInject(pageId);

        res.json({
          success: true,
          message: `已触发页面注入: ${pageId}`,
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('手动注入失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 重新扫描页面
    this.app.post('/rescan-pages', async (req, res) => {
      try {
        if (!this.pageMonitor) {
          return res.status(400).json({
            success: false,
            error: '页面监控器未初始化'
          });
        }

        await this.pageMonitor.rescanPages();

        res.json({
          success: true,
          message: '页面重新扫描完成',
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('页面重新扫描失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  async startBrowser() {
    console.log('🌐 启动浏览器控制服务...');

    this.browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--no-first-run',
        '--window-size=1920,1080'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(30000);

    // 初始化页面生命周期监控器
    this.pageMonitor = new PageLifecycleMonitor(this);
    this.pageMonitor.startMonitoring();

    console.log('✅ 浏览器启动成功');
    console.log('🔍 页面生命周期监控已启动');
  }

  async login1688() {
    console.log('🔐 开始1688登录流程...');

    // 加载Cookie
    try {
      if (fs.existsSync(this.cookiePath)) {
        const cookieData = fs.readFileSync(this.cookiePath, 'utf8');
        const cookieFile = JSON.parse(cookieData);
        const cookies = cookieFile.cookies || cookieFile;

        const playwrightCookies = cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || '.1688.com',
          path: cookie.path || '/',
          expires: cookie.expires ? parseFloat(cookie.expires) : undefined,
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false,
          sameSite: cookie.sameSite || 'Lax'
        }));

        await this.context.addCookies(playwrightCookies);
        console.log(`✅ Cookie加载成功: ${playwrightCookies.length} 个`);
      }
    } catch (error) {
      console.log('⚠️ Cookie加载失败，继续访问');
    }

    // 导航到1688
    await this.page.goto('https://www.1688.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await this.page.waitForTimeout(3000);

    // 检查登录状态
    const isLoggedIn = await this.checkLoginStatus();

    if (isLoggedIn) {
      console.log('✅ 登录状态检查成功');
      this.isLoggedIn = true;

      // 高亮用户头像锚点
      await this.highlightUserAnchor();
    } else {
      console.log('⚠️ 需要手动登录，请在浏览器中完成登录');
      console.log('🔄 监控登录状态中...');

      // 等待手动登录
      await this.waitForManualLogin();
    }
  }

  async checkLoginStatus() {
    try {
      // 多种登录状态检查方式
      const loginIndicators = [
        '.userAvatarLogo img',
        '.user-avatar img',
        '.avatar img',
        '[data-spm-anchor="id"]',
        '.user-info'
      ];

      for (const selector of loginIndicators) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible();
            if (isVisible) {
              console.log(`✅ 发现登录指示器: ${selector}`);
              return true;
            }
          }
        } catch (e) {
          // 继续检查下一个指示器
        }
      }

      return false;
    } catch (error) {
      console.log('❌ 登录状态检查失败:', error.message);
      return false;
    }
  }

  async waitForManualLogin() {
    const maxWaitTime = 300000; // 5分钟
    const checkInterval = 15000; // 15秒
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      await this.page.waitForTimeout(checkInterval);
      elapsedTime += checkInterval;

      const isLoggedIn = await this.checkLoginStatus();

      if (isLoggedIn) {
        console.log('✅ 检测到用户登录成功！');
        this.isLoggedIn = true;

        // 保存新的Cookie
        await this.saveCookies();

        // 高亮用户头像锚点
        await this.highlightUserAnchor();

        return;
      }

      console.log(`⏳ 等待登录中... (${elapsedTime / 1000}s / ${maxWaitTime / 1000}s)`);
    }

    throw new Error('等待登录超时');
  }

  async saveCookies() {
    try {
      const cookies = await this.context.cookies();

      // 确保目录存在
      const cookieDir = path.dirname(this.cookiePath);
      if (!fs.existsSync(cookieDir)) {
        fs.mkdirSync(cookieDir, { recursive: true });
      }

      // 备份现有Cookie
      if (fs.existsSync(this.cookiePath)) {
        const backupPath = `${this.cookiePath}.backup.${Date.now()}`;
        fs.copyFileSync(this.cookiePath, backupPath);
        console.log(`📋 Cookie已备份到: ${backupPath}`);
      }

      // 保存新Cookie
      const cookieData = {
        cookies: cookies,
        timestamp: Date.now(),
        url: 'https://www.1688.com/'
      };

      fs.writeFileSync(this.cookiePath, JSON.stringify(cookieData, null, 2));
      console.log(`✅ Cookie已保存: ${cookies.length} 个`);

    } catch (error) {
      console.error('❌ Cookie保存失败:', error.message);
    }
  }

  async highlightUserAnchor() {
    try {
      console.log('🎯 高亮用户头像锚点...');

      const anchorSelectors = [
        '.userAvatarLogo img',
        '.user-avatar img',
        '.avatar img'
      ];

      for (const selector of anchorSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element && await element.isVisible()) {
            const boundingBox = await element.boundingBox();

            if (boundingBox) {
              await this.page.evaluate((bbox) => {
                const highlight = document.createElement('div');
                highlight.style.position = 'absolute';
                highlight.style.left = bbox.x + 'px';
                highlight.style.top = bbox.y + 'px';
                highlight.style.width = bbox.width + 'px';
                highlight.style.height = bbox.height + 'px';
                highlight.style.backgroundColor = '#00ff00';
                highlight.style.border = '3px solid #00ff00';
                highlight.style.borderRadius = '4px';
                highlight.style.zIndex = '9999';
                highlight.style.pointerEvents = 'none';
                highlight.style.opacity = '0.5';

                const label = document.createElement('div');
                label.style.position = 'absolute';
                label.style.top = '-30px';
                label.style.left = '0';
                label.style.backgroundColor = '#00ff00';
                label.style.color = 'white';
                label.style.padding = '4px 8px';
                label.style.borderRadius = '4px';
                label.style.fontSize = '12px';
                label.style.fontWeight = 'bold';
                label.style.zIndex = '10000';
                label.style.whiteSpace = 'nowrap';
                label.textContent = '用户锚点';

                highlight.appendChild(label);
                document.body.appendChild(highlight);
              }, boundingBox);

              console.log('✅ 用户头像锚点高亮完成');
              return;
            }
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      console.log('⚠️ 未找到用户头像锚点');
    } catch (error) {
      console.error('❌ 锚点高亮失败:', error.message);
    }
  }

  async executeHighlight(elements) {
    console.log(`🎨 执行高亮操作: ${elements.length} 个元素`);

    for (const element of elements) {
      try {
        const { bbox, color = '#00ff00', label } = element;

        await this.page.evaluate((data) => {
          const { bbox, color, label } = data;

          const highlight = document.createElement('div');
          highlight.style.position = 'absolute';
          highlight.style.left = bbox.x1 + 'px';
          highlight.style.top = bbox.y1 + 'px';
          highlight.style.width = (bbox.x2 - bbox.x1) + 'px';
          highlight.style.height = (bbox.y2 - bbox.y1) + 'px';
          highlight.style.backgroundColor = 'transparent';
          highlight.style.border = '3px solid ' + color;
          highlight.style.borderRadius = '4px';
          highlight.style.zIndex = '9999';
          highlight.style.pointerEvents = 'none';
          highlight.style.opacity = '0.8';
          highlight.style.transition = 'all 0.3s ease';

          const elementLabel = document.createElement('div');
          elementLabel.style.position = 'absolute';
          elementLabel.style.top = '-25px';
          elementLabel.style.left = '0';
          elementLabel.style.backgroundColor = color;
          elementLabel.style.color = 'white';
          elementLabel.style.padding = '2px 6px';
          elementLabel.style.borderRadius = '3px';
          elementLabel.style.fontSize = '12px';
          elementLabel.style.fontWeight = 'bold';
          elementLabel.style.zIndex = '10000';
          elementLabel.style.whiteSpace = 'nowrap';
          elementLabel.textContent = label || '识别元素';

          highlight.appendChild(elementLabel);
          document.body.appendChild(highlight);

          // 3秒后添加闪烁效果
          setTimeout(() => {
            highlight.style.animation = 'highlightPulse 1s ease-in-out infinite';
          }, 3000);

          // 添加CSS动画
          if (!document.querySelector('#highlight-animations')) {
            const style = document.createElement('style');
            style.id = 'highlight-animations';
            style.textContent = `
              @keyframes highlightPulse {
                0% { opacity: 0.6; box-shadow: 0 0 10px ${color}; }
                50% { opacity: 1; box-shadow: 0 0 20px ${color}; }
                100% { opacity: 0.6; box-shadow: 0 0 10px ${color}; }
              }
            `;
            document.head.appendChild(style);
          }
        }, { bbox, color, label });

        console.log(`  ✅ 高亮完成: ${label}`);

      } catch (error) {
        console.error(`  ❌ 高亮失败: ${label || '未知元素'}`, error.message);
      }
    }

    console.log('✅ 所有高亮操作完成');
  }

  async cleanup() {
    console.log('🧹 清理浏览器资源...');

    try {
      // 停止页面监控器
      if (this.pageMonitor) {
        this.pageMonitor.stopMonitoring();
        console.log('✅ 页面生命周期监控已停止');
      }

      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      console.log('✅ 浏览器资源清理完成');
    } catch (error) {
      console.error('⚠️ 清理过程中出现错误:', error.message);
    }

    this.browser = null;
    this.context = null;
    this.page = null;
    this.pageMonitor = null;
    this.isLoggedIn = false;
  }

  /**
   * 为页面设置连接协议
   * 这个方法会被页面监控器调用来重新注入JavaScript连接
   */
  async setupPageConnection(page) {
    try {
      console.log(`🔗 为页面设置连接协议: ${page.url()}`);

      // 注入页面连接脚本
      await page.addInitScript(() => {
        // 页面连接管理器
        window.PageConnectionManager = {
          connectionId: Date.now().toString(36) + Math.random().toString(36).substr(2),
          isConnected: false,
          lastHeartbeat: Date.now(),

          // 建立连接
          connect() {
            this.isConnected = true;
            this.lastHeartbeat = Date.now();
            console.log(`页面连接建立: ${this.connectionId}`);

            // 触发自定义事件
            window.dispatchEvent(new CustomEvent('pageConnectionEstablished', {
              detail: { connectionId: this.connectionId }
            }));
          },

          // 断开连接
          disconnect() {
            this.isConnected = false;
            console.log(`页面连接断开: ${this.connectionId}`);

            // 触发自定义事件
            window.dispatchEvent(new CustomEvent('pageConnectionDisconnected', {
              detail: { connectionId: this.connectionId }
            }));
          },

          // 心跳检测
          heartbeat() {
            this.lastHeartbeat = Date.now();
            return this.isConnected;
          },

          // 获取连接状态
          getStatus() {
            return {
              connectionId: this.connectionId,
              isConnected: this.isConnected,
              lastHeartbeat: this.lastHeartbeat,
              uptime: Date.now() - this.lastHeartbeat
            };
          }
        };

        // 自动建立连接
        window.PageConnectionManager.connect();

        // 监听页面卸载事件
        window.addEventListener('beforeunload', () => {
          window.PageConnectionManager.disconnect();
        });

        // 定期心跳检测
        setInterval(() => {
          if (window.PageConnectionManager.isConnected) {
            window.PageConnectionManager.heartbeat();
          }
        }, 30000); // 30秒心跳
      });

      // 执行一些初始化操作
      await page.evaluate(() => {
        console.log('页面JavaScript连接协议注入完成');
      });

      console.log('✅ 页面连接协议设置完成');
      return true;

    } catch (error) {
      console.error('❌ 页面连接协议设置失败:', error);
      throw error;
    }
  }

  start(port = 8001) {
    this.app.listen(port, () => {
      console.log(`🚀 浏览器控制服务启动成功！`);
      console.log(`📡 服务地址: http://localhost:${port}`);
      console.log(`🔗 API端点:`);
      console.log(`   POST /start - 启动浏览器并登录`);
      console.log(`   POST /screenshot - 截取页面截图`);
      console.log(`   POST /highlight - 执行高亮操作`);
      console.log(`   POST /cleanup - 清理浏览器资源`);
      console.log(`   GET  /pages - 获取页面信息`);
      console.log(`   POST /switch-page - 切换页面`);
      console.log(`   GET  /health - 健康检查`);
      console.log(`   GET  /page-monitor-status - 页面监控状态`);
      console.log(`   POST /manual-inject - 手动触发页面注入`);
      console.log(`   POST /rescan-pages - 重新扫描页面`);
      console.log(`\n🔧 页面生命周期监控:`);
      console.log(`   - 自动监控页面创建、刷新、关闭`);
      console.log(`   - 自动重新注入JavaScript连接协议`);
      console.log(`   - 支持手动注入和页面重扫描`);
    });
  }
}

// 启动服务
const service = new BrowserControlService();
service.start(8001);

// 处理进程退出
process.on('SIGINT', () => {
  console.log('\n🛑 收到停止信号，正在关闭服务...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 收到终止信号，正在关闭服务...');
  process.exit(0);
});

export default BrowserControlService;