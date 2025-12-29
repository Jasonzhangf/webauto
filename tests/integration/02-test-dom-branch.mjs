#!/usr/bin/env node
/**
 * 测试 2: DOM 分支拉取功能
 * 验证 dom:branch:2 action 是否正确工作
 */

import { execSync } from 'child_process';
import fs from 'fs';

console.log('📋 测试 2: DOM 分支拉取功能');
console.log('='.repeat(60));

const LOG_FILE = '/tmp/test-dom-branch.log';

if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

const log = (msg) => {
  console.log(msg);
  fs.appendFileSync(LOG_FILE, `${msg}\n`);
};

// 读取容器匹配结果
log('\n[步骤 1] 读取容器匹配结果...');
if (!fs.existsSync('/tmp/container-match-result.json')) {
  log('✗ 请先运行 01-test-container-match.mjs');
  process.exit(1);
}

const matchResult = JSON.parse(fs.readFileSync('/tmp/container-match-result.json', 'utf8'));
const snapshot = matchResult.snapshot || (matchResult.data && matchResult.data.snapshot);

if (!snapshot || !snapshot.container_tree) {
  log('✗ 容器匹配结果中没有容器树');
  process.exit(1);
}

// 收集需要拉取的 DOM 路径
log('\n[步骤 2] 收集需要拉取的 DOM 路径...');
const paths = new Set();

function collectPaths(node) {
  if (node.match && node.match.nodes) {
    node.match.nodes.forEach(m => {
      if (m.dom_path && m.dom_path !== 'root') {
        paths.add(m.dom_path);
      }
    });
  }
  if (node.children) {
    node.children.forEach(c => collectPaths(c));
  }
}

collectPaths(snapshot.container_tree);
log(`✓ 发现 ${paths.size} 个需要拉取的路径`);
paths.forEach((path, i) => {
  log(`  ${i + 1}. ${path}`);
});

if (paths.size === 0) {
  log('⚠ 没有需要拉取的路径，测试跳过');
  process.exit(0);
}

// 检查 Action 映射
log('\n[步骤 3] 检查 dom:branch:2 action 映射...');
try {
  const controllerPath = 'services/unified-api/controller.mjs';
  if (!fs.existsSync(controllerPath)) {
    log(`✗ Controller 文件不存在: ${controllerPath}`);
    process.exit(1);
  }
  
  const controllerCode = fs.readFileSync(controllerPath, 'utf8');
  
  // 检查是否有 dom:branch 相关处理
  if (controllerCode.includes('dom:branch')) {
    log('✓ Controller 中包含 dom:branch 处理');
  } else {
    log('⚠ Controller 中未找到 dom:branch 处理');
  }
  
  // 检查通用 action 处理
  if (controllerCode.includes('handleAction')) {
    log('✓ Controller 支持通用 action 处理');
  }
  
} catch (err) {
  log(`✗ 检查 Controller 失败: ${err.message}`);
}

// 测试 DOM 分支拉取
log('\n[步骤 4] 测试 DOM 分支拉取...');

const testPath = Array.from(paths)[0]; // 测试第一个路径
log(`测试路径: ${testPath}`);

try {
  const branchCmd = `curl -s -X POST http://127.0.0.1:7701/ws \\
    -H 'Content-Type: application/json' \\
    -d '{
      "action": "dom:branch:2",
      "payload": {
        "profile": "weibo_fresh",
        "url": "https://weibo.com",
        "path": "${testPath}",
        "maxDepth": 3,
        "maxChildren": 8
      }
    }'`;
  
  log('\n发送请求...');
  const result = execSync(branchCmd, { 
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 10 * 1024 * 1024
  });
  
  // 保存结果
  fs.writeFileSync('/tmp/dom-branch-result.json', result);
  
  log('\n[验证结果]');
  
  // 尝试解析 JSON
  try {
    const data = JSON.parse(result);
    log(`✓ 返回有效 JSON`);
    log(`  success: ${data.success}`);
    log(`  has data: ${!!data.data}`);
    log(`  has node: ${!!(data.data && data.data.node)}`);
    
    if (data.data && data.data.node) {
      const node = data.data.node;
      log(`\n[节点信息]`);
      log(`  path: ${node.path}`);
      log(`  tag: ${node.tag}`);
      log(`  children: ${node.children?.length || 0}`);
      log(`  childCount: ${node.childCount || 0}`);
      
      log('\n✅ DOM 分支拉取测试通过');
    } else {
      log('✗ 返回数据中没有 node');
      log(`完整返回: ${result.substring(0, 200)}`);
      process.exit(1);
    }
    
  } catch (parseErr) {
    log(`✗ 返回不是有效 JSON`);
    log(`返回内容: ${result.substring(0, 200)}`);
    process.exit(1);
  }
  
} catch (err) {
  log(`✗ DOM 分支拉取失败: ${err.message}`);
  if (err.stderr) log(`  错误输出: ${err.stderr}`);
  process.exit(1);
}

log('\n' + '='.repeat(60));
log(`测试日志已保存到: ${LOG_FILE}`);
log(`结果已保存到: /tmp/dom-branch-result.json`);
