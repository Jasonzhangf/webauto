#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 最终版自动化验证 - 子容器连线
 * 策略：启动服务 → 调用API → 检查返回结果中的连线数据
 */
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForPort(port, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, res => {
          res.statusCode === 200 ? resolve() : reject();
        });
        req.on('error', reject);
        req.setTimeout(1000);
      });
      return true;
    } catch (e) {
      await sleep(500);
    }
  }
  return false;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  子容器连线 - 自动化验证');  
  console.log('═══════════════════════════════════════\n');
  
  const procs = [];
  
  try {
    // 1. 启动后端
    console.log('[1/5] 启动后端服务...');
    procs.push(spawn('node', ['libs/browser/remote-service.js', '--host', '127.0.0.1', '--port', '7704'], {stdio: 'ignore'}));
    procs.push(spawn('node', ['services/unified-api/server.mjs'], {stdio: 'ignore'}));
    
    if (!await waitForPort(7704) || !await waitForPort(7701)) {
      throw new Error('后端服务启动失败');
    }
    console.log('      ✅ 后端就绪\n');
    
    // 2. 测试容器匹配API (自动返回完整 snapshot)
    console.log('[2/5] 调用容器匹配 API...');
    const matchResp = await fetch('http://127.0.0.1:7701/v1/controller/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:match',
        payload: { profile: 'weibo_fresh', url: 'https://weibo.com' }
      })
    });
    
    const matchData = await matchResp.json();
    if (!matchData.success) throw new Error(`匹配失败: ${matchData.error}`);
    console.log('      ✅ 匹配成功\n');
    
    // 3. 验证返回数据结构
    console.log('[3/5] 验证数据结构...');
    const snapshot = matchData.data?.snapshot;
    if (!snapshot) throw new Error('无 snapshot');
    
    const containerTree = snapshot.container_tree;
    if (!containerTree) throw new Error('无 container_tree');
    console.log(`      ✅ 根容器: ${containerTree.id}`);
    
    // 4. 检查子容器
    console.log('\n[4/5] 检查子容器匹配信息...');
    const children = containerTree.children || [];
    if (children.length === 0) throw new Error('无子容器');
    
    let childWithMatch = 0;
    let childWithDomPath = 0;
    
    children.forEach((child, i) => {
      const childId = child.id || child.name;
      const hasMatch = child.match && child.match.nodes && child.match.nodes.length > 0;
      
      if (hasMatch) {
        childWithMatch++;
        const domPath = child.match.nodes[0].dom_path;
        console.log(`      子容器[${i}]: ${childId}`);
        console.log(`        - 匹配: ✅`);
        console.log(`        - DOM路径: ${domPath || 'N/A'}`);
        
        if (domPath && domPath !== 'root') {
          childWithDomPath++;
        }
      }
    });
    
    if (childWithMatch === 0) throw new Error('所有子容器都未匹配');
    if (childWithDomPath === 0) throw new Error('子容器无有效 DOM 路径');
    
    console.log(`\n      📊 子容器统计:`);
    console.log(`         总数: ${children.length}`);
    console.log(`         已匹配: ${childWithMatch}`);
    console.log(`         有DOM路径: ${childWithDomPath}`);
    
    // 5. 测试DOM分支拉取
    console.log('\n[5/5] 测试DOM分支拉取...');
    const testChild = children.find(c => c.match?.nodes?.[0]?.dom_path);
    if (!testChild) throw new Error('无可测试子容器');
    
    const testPath = testChild.match.nodes[0].dom_path;
    console.log(`      测试路径: ${testPath}`);
    
    const branchResp = await fetch('http://127.0.0.1:7701/v1/controller/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'dom:branch:2',
        payload: {
          profile: 'weibo_fresh',
          url: 'https://weibo.com',
          path: testPath,
          maxDepth: 3,
          maxChildren: 5
        }
      })
    });
    
    const branchData = await branchResp.json();
    if (!branchData.success) throw new Error(`分支拉取失败: ${branchData.error}`);
    if (!branchData.data?.node) throw new Error('分支为空');
    
    console.log(`      ✅ 分支拉取成功`);
    console.log(`         路径: ${branchData.data.node.path}`);
    console.log(`         子节点: ${branchData.data.node.children?.length || 0}`);
    
    // 总结
    console.log('\n═══════════════════════════════════════');
    console.log('  🎉 所有验证通过！');
    console.log('═══════════════════════════════════════\n');
    console.log('✅ 证明：');
    console.log('  1. 容器匹配正常工作');
    console.log('  2. 子容器能正确匹配到 DOM 路径');
    console.log('  3. DOM 分支按需拉取正常');
    console.log('');
    console.log('⚠️  剩余验证 (需人工)：');
    console.log('  • 浮窗 UI 是否正确显示连线');
    console.log('  • 连线是否连接到正确的 DOM 节点');
    console.log('');
    console.log('💡 下一步: 启动浮窗查看可视化效果');
    console.log('   node scripts/start-headful.mjs weibo_fresh https://weibo.com');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message);
    process.exit(1);
  } finally {
    procs.forEach(p => p.kill('SIGTERM'));
  }
}

main();
