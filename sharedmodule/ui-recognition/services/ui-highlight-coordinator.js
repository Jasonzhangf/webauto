/**
 * UI识别与高亮协调器
 * 负责协调浏览器服务和UI识别服务
 */
import express from 'express';

class UIHighlightCoordinator {
  constructor() {
    this.app = express();
    this.app.use(express.json());

    // 服务地址
    this.browserServiceUrl = 'http://localhost:8001';
    this.uiServiceUrl = 'http://localhost:8899';

    this.setupRoutes();
  }

  setupRoutes() {
    // 完整的UI识别和高亮流程
    this.app.post('/recognize-and-highlight', async (req, res) => {
      try {
        const { query = '识别页面中的搜索框和用户头像，提供精确的坐标位置' } = req.body;

        console.log('🎯 开始UI识别与高亮流程...');
        console.log(`📋 识别目标: ${query}`);

        // 1. 从浏览器服务获取截图
        console.log('📸 获取页面截图...');
        const screenshotResponse = await fetch(`${this.browserServiceUrl}/screenshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!screenshotResponse.ok) {
          throw new Error(`截图获取失败: ${screenshotResponse.status}`);
        }

        const screenshotData = await screenshotResponse.json();
        const imageBase64 = screenshotData.screenshot;

        console.log('✅ 截图获取成功');

        // 2. 调用UI识别服务
        console.log('🤖 执行UI元素识别...');
        const recognitionResponse = await fetch(`${this.uiServiceUrl}/api/recognize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: Date.now(),
            image: imageBase64,
            query: query,
            scope: 'full',
            parameters: {
              temperature: 0.1,
              max_tokens: 8192
            }
          })
        });

        if (!recognitionResponse.ok) {
          throw new Error(`UI识别失败: ${recognitionResponse.status}`);
        }

        const recognitionResult = await recognitionResponse.json();

        if (!recognitionResult.success) {
          throw new Error('UI识别服务返回失败');
        }

        console.log(`✅ UI识别成功: ${recognitionResult.elements.length} 个元素`);

        // 3. 提取目标元素
        const targetElements = this.extractTargetElements(recognitionResult.elements);

        if (targetElements.length === 0) {
          console.log('⚠️ 未找到目标元素');
          return res.json({
            success: true,
            message: 'UI识别完成，但未找到目标元素',
            totalElements: recognitionResult.elements.length,
            targetElements: 0,
            screenshotData: screenshotData.timestamp
          });
        }

        console.log(`🎯 找到目标元素: ${targetElements.length} 个`);

        // 4. 发送高亮指令给浏览器服务
        console.log('🎨 执行高亮操作...');
        const highlightResponse = await fetch(`${this.browserServiceUrl}/highlight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            elements: targetElements.map(elem => ({
              bbox: elem.bbox,
              color: '#00ff00',
              label: elem.description || elem.text || '识别元素'
            }))
          })
        });

        if (!highlightResponse.ok) {
          throw new Error(`高亮操作失败: ${highlightResponse.status}`);
        }

        const highlightResult = await highlightResponse.json();
        console.log('✅ 高亮操作完成');

        // 5. 返回完整结果
        res.json({
          success: true,
          message: 'UI识别与高亮流程完成',
          workflow: {
            screenshot: {
              success: true,
              timestamp: screenshotData.timestamp
            },
            recognition: {
              success: true,
              totalElements: recognitionResult.elements.length,
              targetElements: targetElements.length
            },
            highlight: {
              success: true,
              highlightedElements: targetElements.length,
              timestamp: highlightResult.timestamp
            }
          },
          elements: targetElements,
          allElements: recognitionResult.elements
        });

      } catch (error) {
        console.error('❌ UI识别与高亮流程失败:', error.message);
        res.status(500).json({
          success: false,
          error: error.message,
          workflow: {
            screenshot: { success: false },
            recognition: { success: false },
            highlight: { success: false }
          }
        });
      }
    });

    // 仅UI识别（不高亮）
    this.app.post('/recognize-only', async (req, res) => {
      try {
        const { query = '识别页面中的所有UI元素' } = req.body;

        console.log('🔍 执行UI识别...');

        // 获取截图
        const screenshotResponse = await fetch(`${this.browserServiceUrl}/screenshot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!screenshotResponse.ok) {
          throw new Error(`截图获取失败: ${screenshotResponse.status}`);
        }

        const screenshotData = await screenshotResponse.json();

        // UI识别
        const recognitionResponse = await fetch(`${this.uiServiceUrl}/api/recognize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: Date.now(),
            image: screenshotData.screenshot,
            query: query,
            scope: 'full',
            parameters: {
              temperature: 0.1,
              max_tokens: 8192
            }
          })
        });

        if (!recognitionResponse.ok) {
          throw new Error(`UI识别失败: ${recognitionResponse.status}`);
        }

        const recognitionResult = await recognitionResponse.json();

        res.json({
          success: true,
          message: 'UI识别完成',
          elements: recognitionResult.elements,
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('❌ UI识别失败:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 自定义高亮
    this.app.post('/highlight-custom', async (req, res) => {
      try {
        const { elements } = req.body;

        if (!elements || !Array.isArray(elements)) {
          return res.status(400).json({
            success: false,
            error: '无效的高亮元素数据'
          });
        }

        console.log(`🎨 执行自定义高亮: ${elements.length} 个元素`);

        const highlightResponse = await fetch(`${this.browserServiceUrl}/highlight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ elements })
        });

        if (!highlightResponse.ok) {
          throw new Error(`高亮操作失败: ${highlightResponse.status}`);
        }

        const highlightResult = await highlightResponse.json();

        res.json({
          success: true,
          message: '自定义高亮完成',
          highlightedElements: elements.length,
          timestamp: highlightResult.timestamp
        });

      } catch (error) {
        console.error('❌ 自定义高亮失败:', error.message);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 服务状态检查
    this.app.get('/status', async (req, res) => {
      try {
        // 检查浏览器服务
        const browserResponse = await fetch(`${this.browserServiceUrl}/health`);
        const browserStatus = browserResponse.ok ? await browserResponse.json() : null;

        // 检查UI识别服务
        const uiResponse = await fetch(`${this.uiServiceUrl}/health`);
        const uiStatus = uiResponse.ok ? await uiResponse.json() : null;

        res.json({
          success: true,
          coordinator: {
            status: 'running',
            timestamp: Date.now()
          },
          browserService: browserStatus,
          uiService: uiStatus,
          overall: (browserStatus && uiStatus) ? 'ready' : 'not_ready'
        });

      } catch (error) {
        res.json({
          success: false,
          error: error.message,
          coordinator: {
            status: 'running',
            timestamp: Date.now()
          },
          browserService: null,
          uiService: null,
          overall: 'error'
        });
      }
    });

    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        service: 'ui-highlight-coordinator',
        status: 'running',
        timestamp: Date.now()
      });
    });
  }

  extractTargetElements(elements) {
    // 提取搜索框
    const searchBoxes = elements.filter(e =>
      e.type === 'input' &&
      (e.text?.includes('搜索') || e.description?.includes('搜索') || e.id?.includes('search'))
    ).map(elem => ({
      ...elem,
      targetType: 'search_box',
      description: elem.description || elem.text || '搜索框'
    }));

    // 提取用户头像
    const userAvatars = elements.filter(e =>
      e.type === 'image' &&
      (e.text?.includes('用户') || e.description?.includes('头像') || e.description?.includes('用户') || e.id?.includes('avatar'))
    ).map(elem => ({
      ...elem,
      targetType: 'user_avatar',
      description: elem.description || elem.text || '用户头像'
    }));

    // 合并目标元素
    const targetElements = [...searchBoxes, ...userAvatars];

    // 显示找到的目标元素
    console.log('\n📋 目标元素识别结果:');
    console.log(`🔍 搜索框: ${searchBoxes.length} 个`);
    searchBoxes.forEach((elem, i) => {
      console.log(`  ${i + 1}. ${elem.description} - (${elem.bbox.x1},${elem.bbox.y1}) → (${elem.bbox.x2},${elem.bbox.y2})`);
    });

    console.log(`👤 用户头像: ${userAvatars.length} 个`);
    userAvatars.forEach((elem, i) => {
      console.log(`  ${i + 1}. ${elem.description} - (${elem.bbox.x1},${elem.bbox.y1}) → (${elem.bbox.x2},${elem.bbox.y2})`);
    });

    return targetElements;
  }

  start(port = 8002) {
    this.app.listen(port, () => {
      console.log(`🚀 UI识别与高亮协调器启动成功！`);
      console.log(`📡 服务地址: http://localhost:${port}`);
      console.log(`🔗 API端点:`);
      console.log(`   POST /recognize-and-highlight - 完整的UI识别与高亮流程`);
      console.log(`   POST /recognize-only - 仅UI识别（不高亮）`);
      console.log(`   POST /highlight-custom - 自定义高亮（提供坐标）`);
      console.log(`   GET  /status - 检查所有服务状态`);
      console.log(`   GET  /health - 健康检查`);
      console.log(`\n🔧 依赖服务:`);
      console.log(`   浏览器控制服务: ${this.browserServiceUrl}`);
      console.log(`   UI识别服务: ${this.uiServiceUrl}`);
    });
  }
}

// 启动服务
const coordinator = new UIHighlightCoordinator();
coordinator.start(8002);

export default UIHighlightCoordinator;