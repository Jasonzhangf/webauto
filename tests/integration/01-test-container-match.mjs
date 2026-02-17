#!/usr/bin/env node
/**
 * 测试 1: 容器匹配基础功能
 * 验证后端能否成功匹配容器并返回正确的数据结构
 */

import { execSync } from 'child_process';
import fs from 'fs';

console.log('📋 测试 1: 容器匹配基础功能');
console.log('='.repeat(60));

const LOG_FILE = '/tmp/test-container-match.log';
const TEST_PROFILE = 'weibo_fresh';
const TEST_URL = 'https://weibo.com';

// 清理旧日志
if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

const log = (msg) => {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, `${msg}\n`);
};

// 步骤 1: 启动服务
log('\n[步骤 1] 启动 Unified API 和 Browser Service...');
let unifiedPid, browserPid;

try {
  // 启动 Unified API
  const unified = execSync('node services/unified-api/server.mjs > /tmp/unified-api.log 2>&1 & echo $!', {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  unifiedPid = unified.trim();
  log(`✓ Unified API 启动: PID ${unifiedPid}`);
  
  // 等待端口可用
  await new Promise(r => setTimeout(r, 2000));
  
  // 健康检查
  const health = execSync('curl -s http://127.0.0.1:7701/health', { encoding: 'utf8' });
  const healthData = JSON.parse(health);
  if (!healthData.ok) throw new Error('Unified API 健康检查失败');
  log(`✓ Unified API 健康: ${health.trim()}`);
  
  // 启动 Browser Service
  const browser = execSync('node dist/modules/camo-backend/src/index.js --host 127.0.0.1 --port 7704 > /tmp/browser-service.log 2>&1 & echo $!', {
    encoding: 'utf8',
    shell: '/bin/bash'
  });
  browserPid = browser.trim();
  log(`✓ Browser Service 启动: PID ${browserPid}`);
  
  await new Promise(r => setTimeout(r, 2000));
  
  const browserHealth = execSync('curl -s http://127.0.0.1:7704/health', { encoding: 'utf8' });
  const browserHealthData = JSON.parse(browserHealth);
  if (!browserHealthData.ok) throw new Error('Browser Service 健康检查失败');
  log(`✓ Browser Service 健康: ${browserHealth.trim()}`);
  
} catch (err) {
  log(`✗ 服务启动失败: ${err.message}`);
  cleanup();
  process.exit(1);
}

// 步骤 2: 创建浏览器会话
log('\n[步骤 2] 创建浏览器会话...');
try {
  const sessionCmd = `curl -s -X POST http://127.0.0.1:7704/start \\
    -H 'Content-Type: application/json' \\
    -d '{"profileId":"${TEST_PROFILE}","url":"${TEST_URL}","headless":false}'`;
  
  const sessionResult = execSync(sessionCmd, { encoding: 'utf8' });
  const sessionData = JSON.parse(sessionResult);
  
  if (!sessionData.ok) {
    throw new Error(`创建会话失败: ${sessionData.error || 'unknown'}`);
  }
  
  log(`✓ 会话创建成功: ${sessionResult.substring(0, 100)}...`);
  
  // 等待页面加载
  await new Promise(r => setTimeout(r, 3000));
  
} catch (err) {
  log(`✗ 会话创建失败: ${err.message}`);
  cleanup();
  process.exit(1);
}

// 步骤 3: 执行容器匹配
log('\n[步骤 3] 执行容器匹配...');
try {
  const matchCmd = `curl -s -X POST http://127.0.0.1:7701/v1/containers/match \\
    -H 'Content-Type: application/json' \\
    -d '{"profileId":"${TEST_PROFILE}","url":"${TEST_URL}"}'`;
  
  const matchResult = execSync(matchCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  
  // 保存完整响应
  fs.writeFileSync('/tmp/container-match-result.json', matchResult);
  
  const matchData = JSON.parse(matchResult);
  
  log('\n[验证结果]');
  log(`✓ 响应成功: ${matchData.success || matchData.ok}`);
  log(`✓ 是否匹配: ${matchData.matched || (matchData.data && matchData.data.matched)}`);
  
  const snapshot = matchData.snapshot || (matchData.data && matchData.data.snapshot);
  if (!snapshot) {
    throw new Error('响应中没有 snapshot 数据');
  }
  
  log(`✓ 容器树存在: ${!!snapshot.container_tree}`);
  log(`✓ DOM 树存在: ${!!snapshot.dom_tree}`);
  
  // 验证容器树结构
  if (snapshot.container_tree) {
    const container = snapshot.container_tree;
    log(`\n[容器树分析]`);
    log(`  根容器 ID: ${container.id || container.name}`);
    log(`  子容器数量: ${container.children?.length || 0}`);
    
    // 检查匹配信息
    if (container.match && container.match.nodes) {
      log(`  根容器匹配节点数: ${container.match.nodes.length}`);
      container.match.nodes.forEach((node, i) => {
        log(`    节点 ${i + 1}: selector="${node.selector}", dom_path="${node.dom_path}"`);
      });
    }
    
    // 检查子容器
    if (container.children && container.children.length > 0) {
      log(`\n[子容器分析]`);
      container.children.forEach((child, i) => {
        log(`  子容器 ${i + 1}: ${child.id || child.name}`);
        if (child.match && child.match.nodes) {
          log(`    匹配节点数: ${child.match.nodes.length}`);
          child.match.nodes.slice(0, 2).forEach((node, j) => {
            log(`      节点 ${j + 1}: dom_path="${node.dom_path}"`);
          });
        }
      });
    }
  }
  
  // 验证 DOM 树
  if (snapshot.dom_tree) {
    const dom = snapshot.dom_tree;
    log(`\n[DOM 树分析]`);
    log(`  根节点路径: ${dom.path}`);
    log(`  根节点标签: ${dom.tag}`);
    log(`  根节点子节点数: ${dom.children?.length || 0}`);
    log(`  根节点 childCount: ${dom.childCount || 0}`);
  }
  
  log('\n✅ 容器匹配测试通过');
  log(`\n完整结果已保存到: /tmp/container-match-result.json`);
  
} catch (err) {
  log(`✗ 容器匹配失败: ${err.message}`);
  if (err.stderr) log(`  错误输出: ${err.stderr}`);
  cleanup();
  process.exit(1);
}

// 清理
function cleanup() {
  log('\n[清理]');
  if (unifiedPid) {
    try {
      execSync(`kill ${unifiedPid}`, { stdio: 'ignore' });
      log(`✓ 停止 Unified API (PID ${unifiedPid})`);
    } catch (e) {}
  }
  if (browserPid) {
    try {
      execSync(`kill ${browserPid}`, { stdio: 'ignore' });
      log(`✓ 停止 Browser Service (PID ${browserPid})`);
    } catch (e) {}
  }
}

cleanup();
log('\n' + '='.repeat(60));
log(`测试日志已保存到: ${LOG_FILE}`);
