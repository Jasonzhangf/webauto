#!/usr/bin/env node
/**
 * 完整的浮窗 UI 高亮功能验证
 * 
 * 验证内容：
 * 1. 点击容器节点 -> 浏览器中高亮（绿色）
 * 2. 点击 DOM 节点 -> 浏览器中高亮（蓝色）
 * 3. 点击新节点时，旧高亮清除
 * 4. 滚动页面时，高亮框跟随元素移动
 * 
 * 前置条件：
 * - 浏览器服务和浮窗 UI 已启动
 * - 已连接到微博页面
 */

import WebSocket from 'ws';


const WS_URL = 'ws://127.0.0.1:8765';
const API_BASE = 'http://127.0.0.1:7701';
const LOG_FILE = '/tmp/webauto-ui-highlight-test.log';

import fs from 'fs';

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      log('✅ WebSocket 连接成功');
      resolve(ws);
    });
    
    ws.on('error', (err) => {
      log(`❌ WebSocket 连接失败: ${err.message}`);
      reject(err);
    });
  });
}

async function highlightBySelector(selector, color, channel) {
  try {
    const res = await fetch(`${API_BASE}/v1/browser/highlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'weibo_fresh',
        selector,
        color,
        options: { channel }
      })
    });
    
    const data = await res.json();
    log(`高亮请求: selector=${selector}, color=${color}, channel=${channel}`);
    log(`高亮结果: ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    log(`❌ 高亮失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function highlightByPath(path, color, channel) {
  try {
    const res = await fetch(`${API_BASE}/v1/browser/highlight-dom-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'weibo_fresh',
        path,
        color,
        options: { channel }
      })
    });
    
    const data = await res.json();
    log(`高亮请求: path=${path}, color=${color}, channel=${channel}`);
    log(`高亮结果: ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    log(`❌ 高亮失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function clearHighlight(channel) {
  try {
    const res = await fetch(`${API_BASE}/v1/browser/clear-highlight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'weibo_fresh',
        channel
      })
    });
    
    const data = await res.json();
    log(`清除高亮: channel=${channel}`);
    return data;
  } catch (err) {
    log(`❌ 清除高亮失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function scrollPage(deltaY) {
  try {
    const res = await fetch(`${API_BASE}/v1/browser/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'weibo_fresh',
        script: `window.scrollBy(0, ${deltaY})`
      })
    });
    
    const data = await res.json();
    log(`滚动页面: deltaY=${deltaY}`);
    return data;
  } catch (err) {
    log(`❌ 滚动失败: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function runTests() {
  log('='.repeat(60));
  log('开始 UI 高亮功能验证');
  log('='.repeat(60));
  
  try {
    log('\n⏳ 正在连接 Browser Service...');
    const ws = await connectWs();
    
    // 测试 1: 高亮容器元素（绿色）
    log('\n📝 测试 1: 高亮容器元素（绿色）');
    log('请在浏览器中查看绿色高亮框...');
    await highlightBySelector('div.woo-panel-main', '2px solid green', 'container');
    await delay(3000);
    
    // 测试 2: 高亮 DOM 元素（蓝色）
    log('\n📝 测试 2: 高亮 DOM 元素（蓝色）');
    log('请在浏览器中查看蓝色高亮框（应该覆盖绿色）...');
    await highlightBySelector('div.woo-panel-main', '2px solid blue', 'dom');
    await delay(3000);
    
    // 测试 3: 清除容器通道，保留 DOM 通道
    log('\n📝 测试 3: 清除容器通道');
    log('绿色高亮应该消失，蓝色保留...');
    await clearHighlight('container');
    await delay(2000);
    
    // 测试 4: 清除 DOM 通道
    log('\n📝 测试 4: 清除 DOM 通道');
    log('蓝色高亮应该消失...');
    await clearHighlight('dom');
    await delay(2000);
    
    // 测试 5: 滚动跟随 - 先高亮一个元素
    log('\n📝 测试 5: 滚动跟随测试');
    log('高亮一个元素（蓝色）...');
    await highlightBySelector('div.woo-panel-main', '2px solid blue', 'dom');
    await delay(2000);
    
    log('向下滚动 300px...');
    await scrollPage(300);
    await delay(2000);
    log('➡️ 请检查：蓝色高亮框是否跟随元素移动？');
    
    log('向上滚动 300px（恢复）...');
    await scrollPage(-300);
    await delay(2000);
    log('➡️ 请检查：蓝色高亮框是否回到原位？');
    
    // 测试 6: 多通道高亮
    log('\n📝 测试 6: 多通道高亮（绿色容器 + 蓝色 DOM）');
    await highlightBySelector('div.woo-panel-main', '2px solid green', 'container');
    await delay(1000);
    await highlightByPath('root/body/div[0]', '2px solid blue', 'dom');
    await delay(3000);
    log('➡️ 请检查：是否同时显示绿色和蓝色高亮框？');
    
    // 清理
    log('\n🧹 清理所有高亮...');
    await clearHighlight('container');
    await clearHighlight('dom');
    
    ws.close();
    
    log('\n' + '='.repeat(60));
    log('✅ 验证完成！');
    log('='.repeat(60));
    log('\n请手动检查以下内容：');
    log('1. ✓ 容器高亮是否正常显示（绿色）');
    log('2. ✓ DOM 高亮是否正常显示（蓝色）');
    log('3. ✓ 高亮切换时，旧高亮是否正确清除');
    log('4. ✓ 滚动时，高亮框是否跟随元素移动');
    log('5. ✓ 多通道高亮是否可以同时显示');
    log(`\n详细日志: ${LOG_FILE}`);
    
    process.exit(0);
  } catch (err) {
    log(`\n❌ 测试出错: ${err.message}`);
    log(err.stack);
    process.exit(1);
  }
}

runTests().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
