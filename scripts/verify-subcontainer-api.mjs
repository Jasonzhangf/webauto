#!/usr/bin/env node
/**
 * 子容器连线 - 纯 API 层自动化验证
 * 目标：验证完整数据流，不依赖UI
 * 
 * 验证链路：
 * 1. containers:match → 返回包含子容器匹配数据的 container_tree
 * 2. 子容器数据 → 包含 match.nodes[].dom_path
 * 3. dom:branch:2 → 能根据 dom_path 拉取深层 DOM
 * 4. 分支数据 → 包含正确的子节点结构
 */
import { spawn } from 'child_process';
import http from 'http';
import { readFileSync } from 'fs';

const log = (...args) => console.log(`[verify-api]`, ...args);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 启动并保持运行的后台服务
async function startBackgroundServices() {
  const procs = [];
  
  // Browser Service
  const bs = spawn('node', [
    'libs/browser/remote-service.js',
    '--host', '127.0.0.1',
    '--port', '7704'
  ], { stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  procs.push(bs);
  
  // Unified API
  const ua = spawn('node', [
    'services/unified-api/server.mjs'
  ], { stdio: ['ignore', 'pipe', 'pipe'], detached: false });
  procs.push(ua);
  
  // 捕获输出避免内存泄漏
  procs.forEach(p => {
    p.stdout?.on('data', () => {});
    p.stderr?.on('data', () => {});
  });
  
  return procs;
}

// 等待端口就绪
async function waitForPort(port, maxWait = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, res => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(String(res.statusCode)));
        });
        req.on('error', reject);
        req.setTimeout(1000);
        req.end();
      });
      return true;
    } catch (e) {
      await sleep(500);
    }
  }
  throw new Error(`端口 ${port} ${maxWait}ms 内未就绪`);
}

// HTTP请求封装
async function postAction(action, payload = {}) {
  const data = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, payload });
    const req = http.request('http://127.0.0.1:7701/v1/controller/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } 
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  
  if (!data.success) {
    throw new Error(`API错误: ${data.error}`);
  }
  return data;
}

// 验证步骤
async function runVerification() {
  log('开始验证...\n');
  const results = {
    '容器匹配API调用': false,
    '子容器存在': false,
    '子容器有match数据': false,
    'match包含dom_path': false,
    'DOM分支拉取API调用': false,
    'DOM分支返回节点': false,
    'DOM分支包含子节点': false,
  };
  
  try {
    // Step 1: 容器匹配
    log('[1/6] 调用容器匹配 API...');
    const matchResult = await postAction('containers:match', {
      profile: 'weibo_fresh',
      url: 'https://weibo.com'
    });
    results['容器匹配API调用'] = true;
    log('     ✅ 容器匹配成功');
    
    const snapshot = matchResult.data?.snapshot;
    if (!snapshot) throw new Error('无 snapshot');
    
    const containerTree = snapshot.container_tree;
    if (!containerTree) throw new Error('无 container_tree');
    log(`     根容器: ${containerTree.id}`);
    
    // Step 2: 检查子容器
    log('\n[2/6] 检查子容器数据...');
    const children = containerTree.children || [];
    if (children.length === 0) throw new Error('无子容器');
    results['子容器存在'] = true;
    log(`     ✅ 找到 ${children.length} 个子容器`);
    
    // Step 3: 检查子容器匹配数据
    log('\n[3/6] 检查子容器匹配信息...');
    let matchedChild = null;
    for (const child of children) {
      const hasMatch = child.match && child.match.nodes && child.match.nodes.length > 0;
      if (hasMatch) {
        matchedChild = child;
        break;
      }
    }
    
    if (!matchedChild) throw new Error('所有子容器都未匹配');
    results['子容器有match数据'] = true;
    log(`     ✅ 子容器已匹配: ${matchedChild.id}`);
    
    // Step 4: 检查 dom_path
    log('\n[4/6] 检查 dom_path...');
    const domPath = matchedChild.match.nodes[0].dom_path;
    if (!domPath) throw new Error('无 dom_path');
    results['match包含dom_path'] = true;
    log(`     ✅ DOM路径: ${domPath}`);
    
    // Step 5: 拉取 DOM 分支
    log('\n[5/6] 调用 DOM 分支拉取 API...');
    const branchResult = await postAction('dom:branch:2', {
      profile: 'weibo_fresh',
      url: 'https://weibo.com',
      path: domPath,
      maxDepth: 3,
      maxChildren: 5
    });
    results['DOM分支拉取API调用'] = true;
    log('     ✅ DOM分支拉取成功');
    
    const branchNode = branchResult.data?.node;
    if (!branchNode) throw new Error('无分支节点');
    results['DOM分支返回节点'] = true;
    log(`     ✅ 分支路径: ${branchNode.path}`);
    
    // Step 6: 验证分支结构
    log('\n[6/6] 验证分支子节点...');
    const childCount = branchNode.children?.length || 0;
    if (childCount === 0) {
      log(`     ⚠️  分支无子节点 (childCount=0)`);
      log(`     💡 这可能说明 DOM 节点下确实没有子元素`);
    } else {
      log(`     ✅ 分支包含 ${childCount} 个子节点`);
    }
    results['DOM分支包含子节点'] = childCount > 0;
    
    // 结果汇总
    log('\n═══════════════════════════════');
    log('  验证结果汇总');
    log('═══════════════════════════════\n');
    
    let passCount = 0;
    for (const [key, passed] of Object.entries(results)) {
      const icon = passed ? '✅' : '❌';
      log(`  ${icon} ${key}`);
      if (passed) passCount++;
    }
    
    log(`\n通过率: ${passCount}/${Object.keys(results).length}`);
    
    if (passCount === Object.keys(results).length) {
      log('\n🎉 所有API验证通过！');
      log('\n📝 结论：');
      log('  1. ✅ 容器匹配API正常工作');
      log('  2. ✅ 子容器能正确匹配到 DOM');
      log('  3. ✅ DOM 路径提取正确');
      log('  4. ✅ DOM 分支拉取API正常工作');
      log('  5. ✅ 返回的数据结构符合预期');
      log('\n💡 UI层验证：');
      log('  浮窗UI现在应该能够：');
      log('  • 自动识别子容器DOM路径');
      log('  • 调用dom:branch:2预拉取');
      log('  • 在domNodePositions中记录真实Y坐标');
      log('  • drawAllConnections成功绘制连线');
      return 0;
    } else {
      log('\n⚠️  部分验证未通过');
      return 1;
    }
    
  } catch (error) {
    log('\n❌ 验证失败:', error.message);
    log('\n❌ 错误详情:', error.stack?.split('\n').slice(0, 5).join('\n'));
    return 1;
  }
}

async function main() {
  console.log('╔════════════════════════════════════╗');
  console.log('║   子容器连线 - API层自动化验证     ║');
  console.log('╚════════════════════════════════════╝\n');
  
  let procs = [];
  let needCleanup = false;
  
  try {
    log('启动后台服务...');
    procs = await startBackgroundServices();
    needCleanup = true;
    
    log('等待服务就绪...');
    await waitForPort(7704);
    log('  ✅ Browser Service (7704)');
    await waitForPort(7701);
    log('  ✅ Unified API (7701)');
    log('\n');
    
    const exitCode = await runVerification();
    
    return exitCode;
    
  } catch (error) {
    log('\n❌ 严重错误:', error.message);
    return 1;
  } finally {
    if (needCleanup) {
      log('\n清理后台进程...');
      procs.forEach(p => p.kill('SIGTERM'));
    }
  }
}

process.exit(await main());
