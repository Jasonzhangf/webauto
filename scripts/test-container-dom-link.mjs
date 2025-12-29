/**
 * 容器-DOM连线诊断测试
 * 目的：验证容器匹配后，能自动拉取深层DOM并建立连线
 */
import { appendFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const DEBUG_LOG = join(homedir(), '.webauto/logs/debug.jsonl');

function log(module, action, data) {
  const entry = JSON.stringify({ 
    timestamp: new Date().toISOString(), 
    module, 
    action, 
    ...data 
  }) + '\n';
  try {
    appendFileSync(DEBUG_LOG, entry);
  } catch (e) {
    // ignore
  }
}

async function runAction(action, params) {
  log('test-container-dom-link', 'runAction', { action, params });
  const resp = await fetch('http://127.0.0.1:7701/v1/controller/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload: params })
  });
  return resp.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  log('test-container-dom-link', 'start', {});

  // 跳过会话创建，假设已经由 start-headful.mjs 启动
  console.log('1️⃣  等待浏览器会话就绪...');
  await sleep(3000);

  // 2. 容器匹配
  console.log('2️⃣  执行容器匹配...');
  const match = await runAction('containers:match', {
    profile: 'weibo_fresh',
    url: 'https://weibo.com'
  });
  if (!match.success || !match.data?.matched) {
    console.error('❌ 容器匹配失败:', match);
    log('test-container-dom-link', 'failed', { step: 'containers:match', error: match });
    process.exit(1);
  }
  console.log('✅ 容器匹配成功');
  log('test-container-dom-link', 'containers:match:success', { 
    container: match.data.container.id,
    matchCount: match.data.container.match_count
  });

  // 3. 提取所有容器的 dom_path（包括子容器）
  console.log('3️⃣  收集容器的 DOM 路径...');
  const paths = [];
  function collectPaths(node) {
    if (node.match?.nodes) {
      node.match.nodes.forEach(m => {
        if (m.dom_path) paths.push(m.dom_path);
      });
    }
    if (node.children) {
      node.children.forEach(child => collectPaths(child));
    }
  }
  collectPaths(match.data.snapshot.container_tree);
  console.log('   找到', paths.length, '个路径:', paths.slice(0, 3).join(', '), '...');
  log('test-container-dom-link', 'paths:collected', { count: paths.length, sample: paths.slice(0, 5) });

  // 4. 按需拉取每个路径的DOM分支
  console.log('4️⃣  按需拉取DOM分支...');
  for (const path of paths) {
    console.log(`   拉取 ${path}...`);
    const branch = await runAction('dom:branch:2', {
      profile: 'weibo_fresh',
      url: 'https://weibo.com',
      path,
      maxDepth: 2,
      maxChildren: 5
    });
    if (branch.success && branch.data?.node) {
      console.log(`   ✅ ${path} (${branch.data.node.children?.length || 0} children)`);
      log('test-container-dom-link', 'dom:branch:success', { path, childCount: branch.data.node.children?.length });
    } else {
      console.log(`   ⚠️  ${path} 拉取失败`);
      log('test-container-dom-link', 'dom:branch:failed', { path, error: branch });
    }
  }

  console.log('\n🎉 测试完成！请检查浮窗UI是否显示完整连线。');
  log('test-container-dom-link', 'complete', {});
}

main().catch(err => {
  log('test-container-dom-link', 'error', { error: String(err) });
  console.error('测试失败:', err);
});
