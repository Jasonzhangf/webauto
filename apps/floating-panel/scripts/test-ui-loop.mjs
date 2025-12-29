#!/usr/bin/env node
/**
 * UI 基础能力回环测试
 * 验证：
 * 1. 容器匹配结果接收
 * 2. DOM 分支拉取
 * 3. 坐标计算
 * 4. 连接线绘制
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = '/tmp/webauto-floating-panel.log';

console.log('📋 UI 基础能力回环测试');
console.log('=' .repeat(50));

// 等待日志文件生成
await new Promise(r => setTimeout(r, 2000));

if (!fs.existsSync(LOG_FILE)) {
  console.error('❌ 日志文件不存在:', LOG_FILE);
  process.exit(1);
}

const logs = fs.readFileSync(LOG_FILE, 'utf8');
const lines = logs.split('\n');

const tests = {
  '总线连接': false,
  '接收容器匹配事件': false,
  '容器树渲染': false,
  'DOM树渲染': false,
  'DOM分支拉取请求': false,
  'DOM分支拉取成功': false,
  'DOM路径展开': false,
  '绘制连接线': false,
  '连接线绘制成功': false
};

// 分析日志
for (const line of lines) {
  if (line.includes('renderer:bus-status-received') && line.includes('connected":true')) {
    tests['总线连接'] = true;
  }
  if (line.includes('containers.matched')) {
    tests['接收容器匹配事件'] = true;
  }
  if (line.includes('renderGraph') && line.includes('hasContainer":true')) {
    tests['容器树渲染'] = true;
  }
  if (line.includes('renderGraph') && line.includes('hasDom":true')) {
    tests['DOM树渲染'] = true;
  }
  if (line.includes('UI action: dom:branch:2')) {
    tests['DOM分支拉取请求'] = true;
  }
  if (line.includes('成功拉取分支')) {
    tests['DOM分支拉取成功'] = true;
  }
  if (line.includes('已合并分支')) {
    tests['DOM路径展开'] = true;
  }
  if (line.includes('drawAllConnections')) {
    tests['绘制连接线'] = true;
  }
  if (line.includes('drawConnectionsForNode') && line.includes('status":"drawn"')) {
    tests['连接线绘制成功'] = true;
  }
}

// 输出结果
console.log('\n测试结果:');
let passed = 0;
let failed = 0;

for (const [name, result] of Object.entries(tests)) {
  const status = result ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} ${name}`);
  if (result) passed++;
  else failed++;
}

console.log('\n' + '='.repeat(50));
console.log(`总计: ${passed} 通过, ${failed} 失败`);

// 如果有失败，分析原因
if (failed > 0) {
  console.log('\n🔍 失败原因分析:');
  
  if (!tests['总线连接']) {
    console.log('- 总线未连接，检查主进程状态同步逻辑');
  }
  
  if (!tests['DOM分支拉取成功']) {
    console.log('- DOM 分支拉取失败，检查:');
    console.log('  1. dom:branch:2 action 是否正确配置');
    console.log('  2. 后端是否返回了数据');
    console.log('  3. 查看日志中的错误信息');
    
    // 查找拉取失败的日志
    const failLogs = lines.filter(l => l.includes('拉取分支失败'));
    if (failLogs.length > 0) {
      console.log('\n  错误日志:');
      failLogs.slice(0, 3).forEach(l => console.log('  ', l.trim()));
    }
  }
  
  if (!tests['连接线绘制成功']) {
    console.log('- 连接线绘制失败，可能原因:');
    console.log('  1. DOM 节点位置未注册 (mapKeysSample)');
    console.log('  2. DOM 树未正确展开');
    console.log('  3. 路径不匹配');
    
    // 查找失败的连接
    const connFailLogs = lines.filter(l => l.includes('drawConnectionsForNode') && l.includes('failed'));
    if (connFailLogs.length > 0) {
      console.log('\n  失败的连接:');
      connFailLogs.slice(0, 3).forEach(l => {
        const match = l.match(/containerId":"([^"]+)"/);
        const path = l.match(/domPath":"([^"]+)"/);
        if (match && path) {
          console.log(`    ${match[1]} -> ${path[1]}`);
        }
      });
    }
  }
}

process.exit(failed > 0 ? 1 : 0);
