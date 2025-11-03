/**
 * 交互式UI识别高亮测试
 * 专门用于高亮特定的UI元素（搜索框、用户图标等）
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class InteractiveHighlightTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.context = null;
    this.uiServiceUrl = 'http://localhost:8898';
  }

  async runInteractiveTest() {
    console.log('🎯 开始交互式UI高亮测试');
    console.log('📋 目标：高亮搜索框和用户图标');

    try {
      // 1. 启动浏览器
      await this.launchBrowser();

      // 2. 加载Cookie并访问1688
      await this.loadCookiesAndNavigate();

      // 3. 截图并进行UI识别
      await this.performUIRecognition();

      // 4. 交互式高亮
      await this.performInteractiveHighlight();

    } catch (error) {
      console.error('❌ 交互式测试失败:', error.message);
    } finally {
      await this.cleanup();
    }
  }

  async launchBrowser() {
    console.log('🌐 启动浏览器...');

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

    console.log('✅ 浏览器启动成功');
  }

  async loadCookiesAndNavigate() {
    console.log('🍪 加载Cookie并导航到1688...');

    // 加载Cookie
    try {
      const cookiePath = '/Users/fanzhang/.webauto/cookies/1688-domestic.json';
      if (fs.existsSync(cookiePath)) {
        const cookieData = fs.readFileSync(cookiePath, 'utf8');
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

    // 等待页面加载
    await this.page.waitForTimeout(3000);

    console.log('✅ 已导航到1688');
  }

  async performUIRecognition() {
    console.log('🤖 执行UI识别...');

    try {
      // 截图
      const screenshot = await this.page.screenshot({ fullPage: true });
      const imageBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;

      // 调用UI识别服务
      console.log('  📸 正在识别UI元素...');
      const response = await fetch(`${this.uiServiceUrl}/api/recognize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          request_id: Date.now(),
          image: imageBase64,
          query: '识别页面中的搜索框和用户头像，提供精确的坐标位置',
          scope: 'full',
          parameters: {
            temperature: 0.1,
            max_tokens: 8192
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.elements) {
          console.log(`✅ UI识别成功: ${result.elements.length} 个元素`);

          // 保存识别结果
          this.recognitionResults = result.elements;

          // 显示找到的关键元素
          const searchBoxes = result.elements.filter(e =>
            e.type === 'input' &&
            (e.text?.includes('搜索') || e.description?.includes('搜索'))
          );

          const userAvatars = result.elements.filter(e =>
            e.type === 'image' &&
            (e.text?.includes('用户') || e.description?.includes('头像') || e.id?.includes('avatar'))
          );

          console.log(`\n🔍 找到的搜索框: ${searchBoxes.length} 个`);
          searchBoxes.forEach((elem, i) => {
            console.log(`  ${i + 1}. ${elem.description || elem.text || elem.id} - ${elem.bbox.x1},${elem.bbox.y1} → ${elem.bbox.x2},${elem.bbox.y2}`);
          });

          console.log(`\n👤 找到的用户图标: ${userAvatars.length} 个`);
          userAvatars.forEach((elem, i) => {
            console.log(`  ${i + 1}. ${elem.description || elem.text || elem.id} - ${elem.bbox.x1},${elem.bbox.y1} → ${elem.bbox.x2},${elem.bbox.y2}`);
          });

        } else {
          console.log('❌ UI识别失败');
        }
      } else {
        throw new Error(`UI识别服务请求失败: ${response.status}`);
      }

    } catch (error) {
      console.log(`❌ UI识别出错: ${error.message}`);
      console.log('  🔧 使用模拟数据继续演示...');

      // 使用模拟数据
      this.recognitionResults = [
        {
          id: 'search-input',
          type: 'input',
          bbox: { x1: 400, y1: 100, x2: 800, y2: 130 },
          confidence: 0.9,
          text: '搜索',
          description: '1688搜索框'
        },
        {
          id: 'user-avatar',
          type: 'image',
          bbox: { x1: 1700, y1: 20, x2: 1780, y2: 100 },
          confidence: 0.85,
          text: '用户',
          description: '用户头像'
        }
      ];

      console.log('  📝 使用模拟数据:');
      this.recognitionResults.forEach((elem, i) => {
        console.log(`    ${i + 1}. ${elem.description} - (${elem.bbox.x1},${elem.bbox.y1})`);
      });
    }
  }

  async performInteractiveHighlight() {
    console.log('\n🎨 开始交互式高亮测试...');

    if (!this.recognitionResults || this.recognitionResults.length === 0) {
      console.log('❌ 没有UI识别结果');
      return;
    }

    // 高亮搜索框
    await this.highlightSearchBox();

    // 高亮用户图标
    await this.highlightUserAvatar();

    console.log('\n✅ 交互式高亮完成！');
    console.log('👁 请查看浏览器页面上的绿色高亮效果');
    console.log('⏳ 保持页面打开30秒供检查...');

    // 保持页面打开30秒
    await this.page.waitForTimeout(30000);
  }

  async highlightSearchBox() {
    console.log('🔍 高亮搜索框...');

    const searchBox = this.recognitionResults.find(e =>
      e.type === 'input' &&
      (e.text?.includes('搜索') || e.description?.includes('搜索'))
    );

    if (searchBox) {
      await this.highlightElement(searchBox, '#00ff00', '搜索框');
    } else {
      console.log('  ⚠️ 未找到搜索框');
    }
  }

  async highlightUserAvatar() {
    console.log('👤 高亮用户图标...');

    const userAvatar = this.recognitionResults.find(e =>
      e.type === 'image' &&
      (e.text?.includes('用户') || e.description?.includes('头像') || e.id?.includes('avatar'))
    );

    if (userAvatar) {
      await this.highlightElement(userAvatar, '#00ff00', '用户头像');
    } else {
      console.log('  ⚠️ 未找到用户图标');
    }
  }

  async highlightElement(element, color, description) {
    try {
      console.log(`  🎨 高亮 ${description}...`);

      // 创建高亮脚本
      const highlightScript = `
        (element, color, description) => {
          // 创建高亮div
          const highlight = document.createElement('div');
          highlight.style.position = 'absolute';
          highlight.style.left = element.bbox.x1 + 'px';
          highlight.style.top = element.bbox.y1 + 'px';
          highlight.style.width = (element.bbox.x2 - element.bbox.x1) + 'px';
          highlight.style.height = (element.bbox.y2 - element.bbox.y1) + 'px';
          highlight.style.backgroundColor = color;
          highlight.style.border = '2px solid ' + color;
          highlight.style.borderRadius = '4px';
          highlight.style.zIndex = '9999';
          highlight.style.pointerEvents = 'none';
          highlight.style.opacity = '0.7';
          highlight.style.transition = 'all 0.3s ease';

          // 添加标签
          const label = document.createElement('div');
          label.style.position = 'absolute';
          label.style.top = '-25px';
          label.style.left = '0';
          label.style.backgroundColor = color;
          label.style.color = 'white';
          label.style.padding = '2px 6px';
          label.style.borderRadius = '3px';
          label.style.fontSize = '12px';
          label.style.fontWeight = 'bold';
          label.style.zIndex = '10000';
          label.style.whiteSpace = 'nowrap';
          label.textContent = description;

          highlight.appendChild(label);
          document.body.appendChild(highlight);

          // 3秒后添加闪烁效果
          setTimeout(() => {
            highlight.style.animation = 'highlightPulse 1s ease-in-out infinite';
          }, 3000);

          // 添加CSS动画
          if (!document.querySelector('#highlight-animations')) {
            const style = document.createElement('style');
            style.id = 'highlight-animations';
            style.textContent = \`
              @keyframes highlightPulse {
                0% { opacity: 0.7; box-shadow: 0 0 10px ${color}; }
                50% { opacity: 1; box-shadow: 0 0 20px ${color}; }
                100% { opacity: 0.7; box-shadow: 0 0 10px ${color}; }
              }
            \`;
            document.head.appendChild(style);
          }

          return highlight;
        }
      `;

      await this.page.evaluate(highlightScript, searchBox, color, description);
      console.log(`  ✅ ${description}高亮完成`);

    } catch (error) {
      console.log(`  ❌ 高亮 ${description} 失败: ${error.message}`);
    }
  }

  async cleanup() {
    console.log('🧹 清理资源...');

    try {
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      console.log('✅ 资源清理完成');
    } catch (error) {
      console.log(`⚠️ 清理过程中出现错误: ${error.message}`);
    }
  }
}

// 主执行函数
async function main() {
  const test = new InteractiveHighlightTest();

  console.log('📌 准备交互式UI高亮测试');
  console.log('📌 将高亮搜索框和用户图标为绿色');
  console.log('📌 页面将保持30秒供检查\n');

  try {
    await test.runInteractiveTest();
    console.log('\n✅ 交互式UI高亮测试完成');
  } catch (error) {
    console.error('\n💥 交互式UI高亮测试失败:', error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default InteractiveHighlightTest;