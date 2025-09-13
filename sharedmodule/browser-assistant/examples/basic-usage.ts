/**
 * 基础使用示例
 * 演示CamoufoxManager、PageOperationCenter和SmartElementSelector的基本用法
 */

import { CamoufoxManager } from '../src/browser/CamoufoxManager';
import { PageOperationCenter } from '../src/operations/SimplePageOperationCenter';
import { SmartElementSelector } from '../src/operations/SimpleSmartElementSelector';

/**
 * 基础浏览器自动化示例
 */
async function basicBrowserAutomationExample() {
  console.log('🚀 开始基础浏览器自动化示例...');

  // 初始化组件
  const browserManager = new CamoufoxManager({ headless: false });
  const operationCenter = new PageOperationCenter();
  const elementSelector = new SmartElementSelector(); // 简化版本不使用AI

  try {
    // 1. 初始化浏览器
    console.log('📱 初始化Camoufox浏览器...');
    await browserManager.initialize();

    // 2. 获取页面实例
    const page = await browserManager.getCurrentPage();
    
    // 3. 导航到示例网站
    console.log('🌐 导航到示例网站...');
    await operationCenter.navigate(page, 'https://example.com');
    
    // 4. 获取页面信息
    const title = await browserManager.getPageTitle();
    const url = await browserManager.getPageUrl();
    console.log(`📄 页面标题: ${title}`);
    console.log(`🔗 页面URL: ${url}`);

    // 5. 截图
    console.log('📸 截图...');
    const screenshot = await browserManager.screenshot();
    console.log(`📷 截图大小: ${screenshot.length} bytes`);

    // 6. 内容提取
    console.log('📝 提取页面内容...');
    const content = await operationCenter.extractContent(page, {
      includeLinks: true,
      includeImages: false
    });
    console.log(`📊 提取了 ${content.links.length} 个链接`);
    console.log(`📝 文本内容长度: ${content.text.length} 字符`);

    // 7. 滚动操作
    console.log('📜 执行滚动操作...');
    await operationCenter.scroll(page, {
      direction: 'down',
      amount: 500,
      smooth: true
    });

    // 8. 执行JavaScript
    console.log('⚡ 执行JavaScript...');
    const jsResult = await browserManager.evaluate(() => {
      return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled
      };
    });
    console.log('🔧 JavaScript执行结果:', jsResult);

    console.log('✅ 基础示例完成！');

  } catch (error) {
    console.error('❌ 基础示例失败:', error);
    
  } finally {
    // 清理资源
    console.log('🧹 清理资源...');
    await browserManager.cleanup();
  }
}

/**
 * 智能元素选择示例
 */
async function smartElementSelectionExample() {
  console.log('🎯 开始智能元素选择示例...');

  const browserManager = new CamoufoxManager({ headless: false });
  const operationCenter = new PageOperationCenter();
  const elementSelector = new SmartElementSelector();

  try {
    await browserManager.initialize();
    const page = await browserManager.getCurrentPage();

    // 导航到有交互元素的网站
    console.log('🌐 导航到交互式网站...');
    await operationCenter.navigate(page, 'https://httpbin.org/forms/post');

    // 智能选择输入框
    console.log('🔍 智能选择用户名输入框...');
    const usernameInput = await elementSelector.selectElement(page, {
      type: 'input',
      attributes: { name: 'custname' }
    });
    
    if (usernameInput.element) {
      console.log('✅ 找到用户名输入框');
      await operationCenter.type(page, usernameInput.element, 'testuser');
    }

    // 智能选择提交按钮
    console.log('🔍 智能选择提交按钮...');
    const submitButton = await elementSelector.selectElement(page, {
      type: 'button',
      text: 'Submit'
    });
    
    if (submitButton.element) {
      console.log('✅ 找到提交按钮');
      // 不点击，只是演示选择功能
    }

    // 选择所有输入元素
    console.log('🔍 选择所有输入元素...');
    const allInputs = await elementSelector.selectAllElements(page, {
      type: 'input'
    });
    console.log(`📝 找到 ${allInputs.length} 个输入元素`);

    console.log('✅ 智能选择示例完成！');

  } catch (error) {
    console.error('❌ 智能选择示例失败:', error);
    
  } finally {
    await browserManager.cleanup();
  }
}

/**
 * Cookie管理示例
 */
async function cookieManagementExample() {
  console.log('🍪 开始Cookie管理示例...');

  const browserManager = new CamoufoxManager({ headless: false });
  const operationCenter = new PageOperationCenter();

  try {
    await browserManager.initialize();
    const page = await browserManager.getCurrentPage();

    // 导航到设置Cookie的网站
    console.log('🌐 导航到Cookie测试网站...');
    await operationCenter.navigate(page, 'https://httpbin.org/cookies/set?test=value&demo=123');

    // 等待Cookie设置
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 保存Cookie
    console.log('💾 保存Cookie...');
    await browserManager.saveCookies();

    // 检查Cookie统计
    const cookieStats = browserManager['cookieManager'].getCookieStats();
    console.log('📊 Cookie统计:', cookieStats);

    // 清除Cookie
    console.log('🧹 清除Cookie...');
    await browserManager.clearAllCookies();

    // 验证Cookie已清除
    const clearedStats = browserManager['cookieManager'].getCookieStats();
    console.log('📊 清除后统计:', clearedStats);

    console.log('✅ Cookie管理示例完成！');

  } catch (error) {
    console.error('❌ Cookie管理示例失败:', error);
    
  } finally {
    await browserManager.cleanup();
  }
}

/**
 * 运行所有示例
 */
async function runAllExamples() {
  console.log('🎬 开始运行所有示例...\n');

  try {
    await basicBrowserAutomationExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await smartElementSelectionExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await cookieManagementExample();
    console.log('\n' + '='.repeat(50) + '\n');
    
    console.log('🎉 所有示例运行完成！');
    
  } catch (error) {
    console.error('❌ 示例运行失败:', error);
  }
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  basicBrowserAutomationExample,
  smartElementSelectionExample,
  cookieManagementExample,
  runAllExamples
};