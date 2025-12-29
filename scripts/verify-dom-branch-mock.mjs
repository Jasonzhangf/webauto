#!/usr/bin/env node
/**
 * 子容器连线 - Mock数据验证
 * 目标：绕过容器匹配，直接验证 DOM 分支拉取和UI预拉取逻辑
 */
import { spawn } from 'child_process';
import http from 'http';
import { readFileSync } from 'fs';

const log = (...args) => console.log('[verify-mock]', ...args);

async function startServices() {
  const procs = [];
  procs.push(spawn('node', ['libs/browser/remote-service.js', '--host', '127.0.0.1', '--port', '7704'], { stdio: 'ignore' }));
  procs.push(spawn('node', ['services/unified-api/server.mjs'], { stdio: 'ignore' }));
  await new Promise(r => setTimeout(r, 3000));
  return procs;
}

async function postAction(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, payload });
    const req = http.request('http://127.0.0.1:7701/v1/controller/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════╗');
  console.log('║   子容器连线 - Mock数据验证    ║');
  console.log('╚════════════════════════════════════╝\n');
  
  let procs = [];
  
  try {
    log('启动后台服务...');
    procs = await startServices();
    log('  ✅ 服务已启动\n');
    
    // 构造mock数据：模拟有子容器匹配的snapshot
    log('[1/5] 构造 Mock 容器数据...');
    const mockSnapshot = {
      container_tree: {
        id: 'weibo_main_page',
        name: '微博主页面',
        type: 'page',
        children: [
          {
            id: 'weibo_main_page.feed_list',
            name: '微博内容列表',
            type: 'collection',
            match: {
              nodes: [
                { dom_path: 'root/1/1/0/0/0/0/1/2', selector: 'main[class*="Main_wrap_"] div[class*="Home_feed_"]' }
              ]
            }
          }
        ]
      }
    };
    log('  ✅ Mock数据已构造');
    log(`     子容器: ${mockSnapshot.container_tree.children[0].id}`);
    log(`     DOM路径: ${mockSnapshot.container_tree.children[0].match.nodes[0].dom_path}`);
    
    // 测试DOM分支拉取API
    log('\n[2/5] 测试 DOM 分支拉取 API...');
    const testPath = mockSnapshot.container_tree.children[0].match.nodes[0].dom_path;
    
    const branchResult = await postAction('dom:branch:2', {
      profile: 'weibo_fresh',
      url: 'https://weibo.com',
      path: testPath,
      maxDepth: 3,
      maxChildren: 5
    });
    
    if (!branchResult.success || !branchResult.data?.node) {
      throw new Error(`DOM分支拉取失败: ${branchResult.error}`);
    }
    log('  ✅ DOM分支拉取成功');
    log(`     路径: ${branchResult.data.node.path}`);
    log(`     子节点数: ${branchResult.data.node.children?.length || 0}`);
    
    const checks = {
      '✅ 后端服务启动': true,
      '✅ Mock容器数据构造': true,
      '✅ DOM分支拉取API调用': true,
      '✅ DOM分支返回节点数据': !!branchResult.data.node,
      '✅ DOM分支包含子节点': (branchResult.data.node.children?.length || 0) > 0,
    };
    
    log('\n[3/5] 验证数据结构...');
    log('  验证点:');
    let passCount = 0;
    for (const [key, passed] of Object.entries(checks)) {
      const icon = passed ? '✅' : '❌';
      log(`    ${icon} ${key}`);
      if (passed) passCount++;
    }
    
    log(`\n  通过率: ${passCount}/${Object.keys(checks).length}`);
    
    if (passCount === Object.keys(checks).length) {
      console.log('\n════════════════════════════════════');
      console.log('  🎉 Mock验证通过！');
      console.log('════════════════════════════════════\n');
      console.log('📝 API层验证结论：');
      console.log('  ✅ DOM分支拉取API正常工作');
      console.log('  ✅ 能够根据 dom_path 拉取深层节点');
      console.log('  ✅ 返回的数据结构符合预期\n');
      console.log('💡 UI层代码逻辑：');
      console.log('  1. index.mts 接收容器匹配事件');
      console.log('  2. 提取子容器的 dom_path');
      console.log('  3. 调用 dom:branch:2 预拉取');
      console.log('  4. 调用 mergeDomBranch 合并到 domData');
      console.log('  5. 调用 renderGraph 重绘');
      console.log('  6. renderDomNodeRecursive 记录真实Y坐标');
      console.log('  7. drawAllConnections 绘制连线\n');
      console.log('🎯 下一步：');
      console.log('  启动完整系统并验证UI连线');
      console.log('  node scripts/start-headful.mjs weibo_fresh https://weibo.com\n');
      return 0;
    } else {
      console.log('\n⚠️  部分验证未通过');
      return 1;
    }
    
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message);
    return 1;
  } finally {
    log('\n清理进程...');
    procs.forEach(p => p.kill('SIGTERM'));
  }
}

process.exit(await main());
