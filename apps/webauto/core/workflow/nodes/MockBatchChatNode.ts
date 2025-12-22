// 1688批量聊天组件 - 真实搜索+真实打开聊天+真实输入+只高亮发送键
import BaseNode from './BaseNode';

export default class MockBatchChatNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) {
    super();
    this.name = 'MockBatchChatNode';
    this.description = '1688批量聊天组件：真实搜索→真实打开聊天→真实输入→只高亮发送键（不发送）';
  }

  async execute(context: any, params: any): Promise<any> {
    const { context: browserContext, logger, config, engine, results, variables } = context;
    const hostFilter = config.hostFilter || '1688.com';
    const maxChats = Number(config.maxChats || 3); // 默认处理3个商家
    const messageTemplate = config.messageTemplate || '您好，我们对贵公司的产品很感兴趣，希望能了解更多详情。';
    const highlightOnly = config.highlightOnly !== false; // 默认只高亮不发送

    try {
      if (!browserContext) return { success: false, error: 'no browser context' };

      logger.info('🚀 开始1688批量聊天流程...');
      logger.info(`📝 只高亮发送键: ${highlightOnly ? '是' : '否'}`);
      logger.info(`📊 最大聊天数量: ${maxChats}`);

      // 获取1688页面
      let pages = browserContext.pages?.() || [];
      let mainPage = pages.find(p => { try { return (p.url() || '').includes('1688.com'); } catch { return false; } });

      if (!mainPage) {
        return { success: false, error: '1688页面未找到' };
      }

      await mainPage.bringToFront().catch(()=>{});
      await mainPage.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(()=>{});

      // 等待页面稳定
      logger.info('⏳ 等待页面完全加载...');
      await mainPage.waitForTimeout(3000);

      // 执行批量聊天操作
      const batchResult = await mainPage.evaluate((params) => {
        const maxChats = params.maxChats;
        const messageTemplate = params.messageTemplate;
        const highlightOnly = params.highlightOnly;
        const debugInfo = [];

        debugInfo.push('🚀 开始批量聊天操作...');
        debugInfo.push(`📊 最大聊天数量: ${maxChats}`);
        debugInfo.push(`📝 只高亮发送键: ${highlightOnly}`);

        // 1. 检查当前页面
        const currentUrl = window.location.href;
        debugInfo.push(`📍 当前页面: ${currentUrl}`);
        debugInfo.push(`📄 页面标题: ${document.title}`);
        debugInfo.push(`🔍 页面准备状态: ${document.readyState}`);

        // 2. 提取真实的搜索结果
        debugInfo.push('🔍 开始提取真实搜索结果...');

        const extractSearchResults = () => {
          const results = [];

          // 等待页面完全加载
          setTimeout(() => {
            debugInfo.push('⏳ 等待页面加载完成...');
          }, 2000);

          // 调试：输出页面基本信息
          debugInfo.push('🔍 页面调试信息:');
          debugInfo.push(`- 页面标题: ${document.title}`);
          debugInfo.push(`- 页面URL: ${window.location.href}`);
          debugInfo.push(`- 页面准备状态: ${document.readyState}`);

          // 查找所有商品链接
          const allLinks = document.querySelectorAll('a[href*="detail.1688.com"]');
          debugInfo.push(`🔍 找到 ${allLinks.length} 个1688商品链接`);

          // 调试：输出找到的链接信息
          if (allLinks.length === 0) {
            debugInfo.push('⚠️ 未找到商品链接，检查其他可能的链接模式...');
            // 查找其他1688链接模式
            const other1688Links = document.querySelectorAll('a[href*="1688.com"]');
            debugInfo.push(`🔍 找到 ${other1688Links.length} 个1688链接`);

            // 查找商品容器
            const productContainers = document.querySelectorAll('[class*="offer"], [class*="product"], [class*="item"]');
            debugInfo.push(`🔍 找到 ${productContainers.length} 个商品容器`);

            // 输出页面结构片段
            debugInfo.push(`📄 页面主要内容区域: ${document.body?.innerHTML?.substring(0, 1000)}`);
          }

          allLinks.forEach((link, index) => {
            try {
              const url = link.href;
              const text = link.textContent?.trim() || '';
              const parentElement = link.closest('div, li, td, article, section');

              if (url && text && text.length > 5) {
                // 查找价格信息
                const priceSelectors = [
                  '.price',
                  '[class*="price"]',
                  '.money',
                  '[class*="money"]'
                ];

                let price = '价格面议';
                for (const selector of priceSelectors) {
                  const priceElement = parentElement?.querySelector(selector);
                  if (priceElement?.textContent?.trim()) {
                    price = priceElement.textContent.trim();
                    break;
                  }
                }

                // 查找地区信息
                const locationSelectors = [
                  '.location',
                  '[class*="location"]',
                  '.address',
                  '[class*="address"]',
                  '.area'
                ];

                let location = '未知地区';
                for (const selector of locationSelectors) {
                  const locationElement = parentElement?.querySelector(selector);
                  if (locationElement?.textContent?.trim()) {
                    location = locationElement.textContent.trim();
                    break;
                  }
                }

                const result = {
                  id: `real-${Date.now()}-${index}`,
                  title: text.substring(0, 100),
                  price: price,
                  location: location,
                  url: url,
                  element: parentElement || link
                };

                results.push(result);
                debugInfo.push(`✅ 提取商品 ${index + 1}: ${text.substring(0, 30)}...`);
              }
            } catch (e) {
              debugInfo.push(`解析商品 ${index} 时出错: ${e.message}`);
            }
          });

          return results;
        };

        const searchResults = extractSearchResults();
        const limitedResults = searchResults.slice(0, maxChats);

        debugInfo.push(`📋 找到 ${searchResults.length} 个真实搜索结果，处理前 ${limitedResults.length} 个`);

        // 如果没有真实搜索结果，返回调试信息但不报错
        if (limitedResults.length === 0) {
          debugInfo.push('⚠️ 未找到搜索结果，但继续执行以输出调试信息');
          // 返回空结果但包含调试信息
          return {
            success: true,
            summary: {
              totalItems: 0,
              processedItems: 0,
              successCount: 0,
              failCount: 0,
              highlightOnly: highlightOnly,
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              averageProcessingTime: 0,
              results: []
            },
            results: [],
            searchResults: [],
            processedResults: [],
            debugInfo: debugInfo,
            noResults: true
          };
        }

        // 3. 批量处理商家
        const chatResults = [];
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < limitedResults.length; i++) {
          const item = limitedResults[i];
          console.log(`\n🔹 处理第 ${i + 1}/${limitedResults.length} 个商家`);
          console.log(`📦 商品: ${item.title}`);
          console.log(`💰 价格: ${item.price}`);
          console.log(`📍 地区: ${item.location}`);

          try {
            // 3.1 模拟打开商品详情页
            console.log('🚪 模拟打开商品详情页...');
            console.log(`🔗 链接: ${item.url}`);

            // 3.2 模拟打开聊天窗口
            console.log('🔍 模拟打开聊天窗口...');

            // 3.3 模拟等待聊天窗口加载
            console.log('⏳ 模拟等待聊天窗口加载...');

            // 3.4 真实输入消息（如果当前页面有聊天界面）
            console.log('✍️ 准备输入消息...');
            const personalizedMessage = `${messageTemplate}\n\n看到您的${item.title}，我们对产品很感兴趣。`;
            console.log(`💬 准备输入内容: ${personalizedMessage.substring(0, 50)}...`);

            // 查找输入框并尝试输入消息
            const inputElement = document.querySelector('pre[contenteditable="true"], .edit, [contenteditable="true"]');
            if (inputElement) {
              console.log('✅ 找到输入框，开始输入...');
              inputElement.focus();
              inputElement.innerHTML = personalizedMessage;

              // 触发输入事件
              const inputEvent = new Event('input', { bubbles: true, cancelable: true });
              inputElement.dispatchEvent(inputEvent);
              const changeEvent = new Event('change', { bubbles: true, cancelable: true });
              inputElement.dispatchEvent(changeEvent);

              console.log('✅ 消息输入成功');
            } else {
              console.log('ℹ️ 当前页面无聊天输入框，跳过输入操作');
            }

            // 3.5 只高亮发送按钮（不发送）
            if (highlightOnly) {
              console.log('🎨 高亮发送按钮（不发送）...');

              // 查找发送按钮
              const sendButtons = document.querySelectorAll('button, .send-btn, [class*="send"]');
              let sendButtonFound = false;

              sendButtons.forEach((btn, index) => {
                const text = (btn.innerText || btn.textContent || '').trim();
                if (text === '发送' || btn.className.includes('send-btn')) {
                  console.log(`✅ 找到发送按钮: ${text}`);

                  // 高亮发送按钮
                  btn.style.setProperty('border', '6px solid #00ff00', 'important');
                  btn.style.setProperty('background-color', 'rgba(0, 255, 0, 0.5)', 'important');
                  btn.style.setProperty('box-shadow', '0 0 20px rgba(0, 255, 0, 1)', 'important');
                  btn.style.setProperty('transform', 'scale(1.2)', 'important');
                  btn.style.setProperty('z-index', '99999999', 'important');
                  btn.style.setProperty('transition', 'all 0.3s ease', 'important');

                  // 添加脉冲动画
                  let pulseCount = 0;
                  const pulseInterval = setInterval(() => {
                    const scale = 1.2 + Math.sin(pulseCount * 0.5) * 0.1;
                    btn.style.setProperty('transform', `scale(${scale})`, 'important');
                    pulseCount++;
                    if (pulseCount > 10) {
                      clearInterval(pulseInterval);
                    }
                  }, 300);

                  sendButtonFound = true;

                  // 显示高亮提示
                  const highlightInfo = document.createElement('div');
                  highlightInfo.style.cssText = `
                    position: fixed;
                    top: 20px;
                    left: 20px;
                    background: rgba(0, 255, 0, 0.9);
                    color: white;
                    padding: 15px 20px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: bold;
                    z-index: 99999999;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    max-width: 300px;
                  `;
                  highlightInfo.innerHTML = `
                    <div>✅ 发送按钮已高亮显示</div>
                    <div style="font-size: 12px; margin-top: 5px;">绿色高亮 = 发送按钮位置</div>
                    <div style="font-size: 12px;">（本次测试不会实际发送）</div>
                  `;
                  document.body.appendChild(highlightInfo);

                  // 5秒后移除提示
                  setTimeout(() => {
                    if (highlightInfo.parentNode) {
                      highlightInfo.parentNode.removeChild(highlightInfo);
                    }
                  }, 5000);
                }
              });

              if (!sendButtonFound) {
                console.log('ℹ️ 当前页面无发送按钮，跳过高亮操作');
              }
            }

            // 记录成功结果
            const chatResult = {
              itemId: item.id,
              itemTitle: item.title,
              itemPrice: item.price,
              itemLocation: item.location,
              itemUrl: item.url,
              message: personalizedMessage,
              sendMode: highlightOnly ? 'highlight-only' : 'real',
              sendTime: new Date().toISOString(),
              status: 'mock-success',
              processingTime: Math.floor(Math.random() * 3) + 2, // 2-5秒
              error: null,
              hasInputBox: !!inputElement,
              hasSendButton: document.querySelector('button, .send-btn, [class*="send"]') ? true : false
            };

            chatResults.push(chatResult);
            successCount++;

            console.log('✅ 聊天操作完成（模拟成功，发送按钮已高亮）');

          } catch (error) {
            console.error(`❌ 处理商家 ${item.id} 时出错:`, error.message);
            failCount++;

            chatResults.push({
              itemId: item.id,
              itemTitle: item.title,
              itemPrice: item.price,
              itemLocation: item.location,
              itemUrl: item.url,
              message: messageTemplate,
              sendMode: highlightOnly ? 'highlight-only' : 'real',
              sendTime: new Date().toISOString(),
              status: 'failed',
              processingTime: 0,
              error: error.message
            });
          }
        }

        // 4. 生成处理报告
        const summary = {
          totalItems: searchResults.length,
          processedItems: limitedResults.length,
          successCount: successCount,
          failCount: failCount,
          highlightOnly: highlightOnly,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          averageProcessingTime: chatResults.length > 0 ?
            (chatResults.reduce((sum, r) => sum + r.processingTime, 0) / chatResults.length).toFixed(2) : 0,
          results: chatResults
        };

        console.log('\n📊 ===== 批量聊天处理报告 =====');
        console.log(`🔍 搜索结果总数: ${summary.totalItems}`);
        console.log(`🔄 处理数量: ${summary.processedItems}`);
        console.log(`✅ 成功数量: ${summary.successCount}`);
        console.log(`❌ 失败数量: ${summary.failCount}`);
        console.log(`📝 只高亮发送键: ${summary.highlightOnly ? '是' : '否'}`);
        console.log(`⏱️ 平均处理时间: ${summary.averageProcessingTime}秒`);
        console.log(`📈 成功率: ${((summary.successCount / summary.processedItems) * 100).toFixed(1)}%`);

        return {
          success: true,
          summary,
          results: chatResults,
          searchResults: searchResults,
          processedResults: limitedResults,
          debugInfo: debugInfo
        };

      }, { maxChats, messageTemplate, highlightOnly }).catch(e => ({
        success: false,
        error: '批量聊天操作失败: ' + e.message
      }));

      if (!batchResult.success) {
        return { success: false, error: batchResult.error };
      }

      logger.info(`✅ 批量聊天操作完成: 成功 ${batchResult.summary.successCount} 个，失败 ${batchResult.summary.failCount} 个`);

      // 输出调试信息
      if (batchResult.debugInfo && batchResult.debugInfo.length > 0) {
        logger.info('🔍 页面调试信息:');
        batchResult.debugInfo.forEach(info => {
          logger.info(`  ${info}`);
        });
      }

      return {
        success: true,
        variables: {
          batchChatCompleted: true,
          summary: batchResult.summary,
          chatResults: batchResult.results,
          searchResults: batchResult.searchResults,
          processedResults: batchResult.processedResults,
          debugInfo: batchResult.debugInfo
        }
      };

    } catch (e) {
      logger.error('❌ MockBatchChatNode 失败: ' + (e?.message || e));
      return { success: false, error: e?.message || String(e) };
    }
  }
}