#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 子容器连线 - API层验证 (最终版)
 * 适配：使用正确的容器和URL确保子容器有match数据
 */
import { spawn } from 'child_process';
import http from 'http';

const log = (...args) => console.log('[verify-final]', ...args);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startServices() {
  const procs = [];
  procs.push(spawn('node', ['libs/browser/remote-service.js', '--host', '127.0.0.1', '--port', '7704'], { stdio: 'ignore' }));
  procs.push(spawn('node', ['services/unified-api/server.mjs'], { stdio: 'ignore' }));
  await sleep(3000);
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
  console.log('║   子容器连线 - API验证 (最终版)   ║');
  console.log('╚════════════════════════════════════╝\n');
  
  let procs = [];
  
  try {
    log('启动后台服务...');
    procs = await startServices();
    log('  ✅ 服务已启动\n');
    
    // 使用已知有子容器匹配的配置
    log('[1/4] 调用容器匹配 (使用 weibo 主页配置)...');
    
    // 尝试多种URL/Profile组合，确保匹配到有子容器的页面
    const testCases = [
      { profile: 'weibo_fresh', url: 'https://weibo.com' },
      { profile: 'weibo', url: 'https://weibo.com' },
    ];
    
    let successfulMatch = null;
    
    for (const testCase of testCases) {
      try {
        const matchResult = await postAction('containers:match', {
          profile: testCase.profile,
          url: testCase.url
        });
        
        if (matchResult.success && matchResult.data?.snapshot?.container_tree) {
          const tree = matchResult.data.snapshot.container_tree;
          const children = tree.children || [];
          
          // 检查是否有子容器且子容器有match数据
          const hasMatchedChildren = children.some(c => 
            c.match && c.match.nodes && c.match.nodes.length > 0
          );
          
          if (hasMatchedChildren) {
            log(`  ✅ 找到有效匹配: ${tree.id} (with ${children.length} children)`);
            successfulMatch = matchResult.data;
            break;
          } else {
            log(`  ⏭  ${tree.id} (子容器无match)`);
          }
        }
      } catch (e) {
        log(`  ⚠️  ${testCase.url} 失败: ${e.message}`);
      }
    }
    
    if (!successfulMatch) {
      throw new Error('未找到有子容器匹配的容器');
    }
    
    const snapshot = successfulMatch.snapshot;
    const containerTree = snapshot.container_tree;
    
    log(`\n[2/4] 分析容器结构...`);
    log(`  根容器: ${containerTree.id}`);
    log(`  子容器数: ${containerTree.children?.length || 0}`);
    
    const children = containerTree.children;
    let targetChild = null;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const hasMatch = child.match && child.match.nodes && child.match.nodes.length > 0;
      log(`  子[${i}]: ${child.id}`);
      log(`    - 匹配: ${hasMatch ? '✅' : '❌'}`);
      
      if (hasMatch) {
        targetChild = child;
        break;
      }
    }
    
    if (!targetChild) {
      throw new Error('所有子容器都未匹配到 DOM');
    }
    
    const domPath = targetChild.match.nodes[0].dom_path;
    log(`\n[3/4] 测试DOM分支拉取...`);
    log(`  目标子容器: ${targetChild.id}`);
    log(`  DOM路径: ${domPath}`);
    
    const branchResult = await postAction('dom:branch:2', {
      profile: 'weibo_fresh',
      url: 'https://weibo.com',
      path: domPath,
      maxDepth: 3,
      maxChildren: 5
    });
    
    if (!branchResult.success || !branchResult.data?.node) {
      throw new Error(`DOM分支拉取失败: ${branchResult.error}`);
    }
    
    log(`  ✅ 分支拉取成功`);
    const branch = branchResult.data.node;
    log(`  路径: ${branch.path}`);
    log(`  子节点: ${branch.children?.length || 0}`);
    
    log(`\n[4/4] 验证数据流完整性...`);
    
    const checks = {
      '✅ 容器匹配API可用': true,
      '✅ 子容器存在': children.length > 0,
      '✅ 子容器有match数据': true,
      '✅ match包含dom_path': !!domPath,
      '✅ DOM分支API可用': true,
      '✅ 分支返回结构': !!branch.path,
      '✅ 分支包含子节点': (branch.children?.length || 0) > 0,
    };
    
    log('\n验证结果:');
    let passCount = 0;
    for (const [key, passed] of Object.entries(checks)) {
      const icon = passed ? '✅' : '❌';
      log(`  ${icon} ${key}`);
      if (passed) passCount++;
    }
    
    log(`\n通过率: ${passCount}/${Object.keys(checks).length}`);
    
    if (passCount === Object.keys(checks).length) {
      console.log('\n════════════════════════════════════');
      console.log('  🎉 所有验证通过！');
      console.log('════════════════════════════════════\n');
      console.log('📝 API层验证结论：');
      console.log('  ✅ 容器匹配API正常返回数据');
      console.log('  ✅ 子容器包含正确的DOM路径信息');
      console.log('  ✅ DOM分支API能够拉取深层节点');
      console.log('  ✅ 数据结构符合UI连线所需格式\n');
      console.log('💡 UI层需要完成的工作：');
      console.log('  1. 接收容器匹配事件');
      console.log('  2. 提取子容器的dom_path');
      console.log('  3. 调用dom:branch:2预拉取');
      console.log('  4. 合并分支到DOM树');
      console.log('  5. 重新渲染graph并画线\n');
      console.log('🎯 代码位置：');
      console.log('  • apps/floating-panel/src/renderer/index.mts (预拉取逻辑)');
      console.log('  • apps/floating-panel/src/renderer/graph.mjs (渲染+连线)');
      console.log('');
      return 0;
    } else {
      console.log('\n⚠️  部分验证未通过，请检查日志\n');
      return 1;
    }
    
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message);
    console.error('错误详情:', error.stack?.split('\n').slice(0, 5).join('\n'));
    return 1;
  } finally {
    log('\n清理进程...');
    procs.forEach(p => p.kill('SIGTERM'));
  }
}

process.exit(await main());
