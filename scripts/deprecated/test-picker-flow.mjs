#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * DOM捕获功能流程测试
 * 验证：1. 点击捕获按钮 2. picker结果返回 3. 实线高亮显示 4. DOM高亮 5. 建议子容器创建
 */

const log = (msg) => console.log(`[picker-test] ${msg}`);

async function testPickerFlow() {
  try {
    log('测试 DOM 捕获完整流程...');
    
    // 等待服务启动
    log('等待服务就绪 (7701)...');
    const healthRes = await fetch('http://127.0.0.1:7701/health');
    if (!healthRes.ok) {
      throw new Error(`服务未就绪: ${healthRes.status}`);
    }
    log('✅ 服务就绪');
    
    // 验证浏览器会话存在
    log('检查浏览器会话...');
    const sessRes = await fetch('http://127.0.0.1:7704/health');
    if (!sessRes.ok) {
      throw new Error(`浏览器服务未就绪: ${sessRes.status}`);
    }
    log('✅ 浏览器服务就绪');
    
    log('\n验证步骤:');
    log('1. 打开浮窗并查看控制台');
    log('2. 点击"捕获元素"按钮');
    log('3. 鼠标移动到页面元素上（应该看到虚线橙色框）');
    log('4. 点击选择元素');
    log('\n预期结果:');
    log('✓ 虚线橙色框变为实线橙色框');
    log('✓ 浮窗DOM树中对应节点高亮');
    log('✓ 容器树中出现橙色虚框建议节点');
    log('✓ 控制台打印: [picker] Received DOM path: ...');
    log('✓ 控制台打印: [picker] Found nearest container: ...');
    
    log('\n错误排查:');
    log('如果实线高亮未显示，检查:');
    log('  - [preload] highlightElement called: ... (应该看到 domPath 和 profile)');
    log('  - [main] Highlight request: ... (应该是 /v1/browser/highlight-dom-path)');
    log('如果DOM未高亮，检查:');
    log('  - currentProfile 是否正确保存');
    log('  - expandDomPath 是否执行');
    log('如果建议节点未出现，检查:');
    log('  - findNearestContainer 是否返回容器');
    log('  - renderGraph 是否被调用');
    
  } catch (err) {
    log(`❌ 错误: ${err.message}`);
    process.exit(1);
  }
}

testPickerFlow();
