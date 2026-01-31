#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();


import { createBrowserControllerClient } from '../services/unified-api/browser-controller-client.mjs';

const { post } = createBrowserControllerClient();

async function main() {
  console.log('[pick-dom-cli] 开始测试 pick-dom CLI 功能...');
  
  const profile = 'weibo_fresh';
  const url = 'https://weibo.com';
  
  console.log(`[pick-dom-cli] Profile: ${profile}`);
  console.log('[pick-dom-cli] 请在浏览器中 hover 并点击一个元素（60秒超时）...');
  
  try {
    const startTime = Date.now();
    const result = await post('browser:pick-dom', {
      profile,
      url
    }, 60000);
    const elapsed = Date.now() - startTime;
    
    console.log(`[pick-dom-cli] 结果返回，耗时: ${elapsed} ms`);
    console.log('[pick-dom-cli] 完整结果:', JSON.stringify(result, null, 2));
    
    if (result.success && result.data) {
      const { dom_path, selector } = result.data;
      
      if (!dom_path) {
        console.error('❌ pick-dom CLI 测试失败: 缺少 dom_path');
        process.exit(1);
      }
      
      if (!selector) {
        console.error('❌ pick-dom CLI 测试失败: 缺少 selector');
        process.exit(1);
      }
      
      console.log('✅ pick-dom CLI 测试成功:');
      console.log(`  - dom_path: ${dom_path}`);
      console.log(`  - selector: ${selector}`);
      console.log(`  - tag: ${result.data.tag}`);
      console.log(`  - bounding_rect:`, result.data.bounding_rect);
      
      console.log('');
      console.log('✅ 验证通过: dom_path 和 selector 都已返回');
    } else {
      console.error('❌ pick-dom CLI 测试失败: 无效响应');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ pick-dom CLI 测试异常:', err.message);
    process.exit(1);
  }
}

main();
