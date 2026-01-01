#!/usr/bin/env node

/**
 * 容器操作集成测试
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = '/tmp/webauto-container-ops-test.log';
const REPO_ROOT = path.join(__dirname, '../../..');
const CONTAINER_LIB = path.join(REPO_ROOT, 'container-library');

function log(msg) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${timestamp}] [container-ops] ${msg}\n`;
  console.log(msg);
  try { fs.appendFileSync(LOG_FILE, line, 'utf8'); } catch {}
}

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    log(`  读取失败: ${filePath}: ${err.message}`);
    return null;
  }
}

function findContainerFiles(rootDir, site = '') {
  const containers = [];
  
  function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        walk(filePath);
      } else if (file === 'container.json' && (!site || dir.includes(site))) {
        containers.push(filePath);
      }
    }
  }
  
  walk(rootDir);
  return containers;
}

function getContainerDefinitions(site = 'weibo') {
  log(`=== 加载容器定义 (${site}) ===\n`);
  
  const containers = new Map();
  const siteDir = path.join(CONTAINER_LIB, site);
  const files = findContainerFiles(siteDir);
  
  log(`找到 ${files.length} 个容器定义`);
  
  for (const file of files) {
    const data = readJsonFile(file);
    if (data?.id) {
      containers.set(data.id, data);
    }
  }
  
  log(`✅ 加载了 ${containers.size} 个有效容器定义\n`);
  return containers;
}

function validateOperations(containers) {
  log('=== 容器操作验证 ===\n');
  const issues = [];
  
  // 定义操作类型及其所需的 capability
  const opCapabilities = {
    'highlight': ['highlight'],
    'find-child': ['find-child', 'highlight'],
    'scroll': ['scroll'],
    'click': ['click', 'highlight'],
    'input': ['input', 'highlight'],
    'mouse-move': ['highlight'],
    'type': ['input', 'highlight']
  };
  
  for (const [id, container] of containers.entries()) {
    const ops = container.operations || [];
    const caps = container.capabilities || [];
    
    for (const op of ops) {
      const opId = op?.type || op?.id || op?.operationType;
      if (!opId) {
        issues.push({ container: id, issue: 'operation missing type/id', op });
        continue;
      }
      
      const required = opCapabilities[opId] || [];
      const missingCaps = required.filter(cap => !caps.includes(cap));
      
      if (missingCaps.length > 0) {
        issues.push({
          container: id,
          operation: opId,
          issue: `missing capabilities: ${missingCaps.join(', ')}`,
          required,
          declared: caps
        });
      }
    }
  }
  
  if (issues.length === 0) {
    log('✅ 所有容器操作声明正确\n');
  } else {
    log(`❌ 发现 ${issues.length} 个操作声明问题\n`);
    for (const issue of issues) {
      log(`  [${issue.container}] ${issue.operation}: ${issue.issue}`);
    }
  }
  
  return issues;
}

function analyzeContainerBindings(containers) {
  log('=== 容器操作绑定分析 ===\n');
  const operations = new Map();
  
  for (const [id, container] of containers.entries()) {
    const ops = container.operations || [];
    for (const op of ops) {
      const opId = op?.type || op?.id || op?.operationType;
      if (opId) {
        if (!operations.has(opId)) {
          operations.set(opId, []);
        }
        operations.get(opId).push({ container: id, operation: op });
      }
    }
  }
  
  log(`发现的操作类型: ${operations.size}`);
  for (const [opId, bindings] of operations.entries()) {
    log(`  ${opId}: ${bindings.length} 个绑定`);
  }
  
  return operations;
}

async function runTests() {
  log('=== WebAuto 容器操作集成测试 ===\n');
  try { fs.writeFileSync(LOG_FILE, '', 'utf8'); } catch {}
  
  const containers = getContainerDefinitions('weibo');
  
  if (containers.size === 0) {
    log('❌ 没有加载到容器定义');
    return false;
  }
  
  // 1. 验证操作声明
  const issues = validateOperations(containers);
  
  // 2. 分析操作绑定
  const opsMap = analyzeContainerBindings(containers);
  
  // 3. 检查核心操作
  const coreOps = ['find-child', 'highlight', 'scroll', 'click'];
  const missingOps = coreOps.filter(op => !opsMap.has(op));
  
  log(`\n=== 核心操作检查 ===\n`);
  for (const op of coreOps) {
    const bindings = opsMap.get(op);
    const icon = bindings ? '✅' : '⚠️ ';
    const count = bindings ? bindings.length : 0;
    log(`${icon} ${op}: ${count} 个绑定`);
  }
  
  if (missingOps.length > 0) {
    log(`\n⚠️  未声明核心操作: ${missingOps.join(', ')}`);
  }
  
  log(`\n=== 测试总结 ===\n`);
  
  const total = 2 + coreOps.length; // validation + bindings + core ops check
  const passed = (issues.length === 0 ? 1 : 0) + (missingOps.length === 0 ? 1 : 0);
  
  log(`容器验证: ${issues.length === 0 ? '✅' : '❌'}`);
  log(`操作绑定: ${opsMap.size > 0 ? '✅' : '❌'}`);
  log(`核心操作: ${missingOps.length === 0 ? '✅' : '⚠️ '}`);
  log(`\n总计: ${passed}/${total}`);
  
  if (issues.length === 0 && missingOps.length === 0) {
    log('\n🎉 所有测试通过！\n');
    return true;
  } else if (issues.length === 0) {
    log('\n✅ 容器操作声明正确\n');
    log(`💡 ${missingOps.length} 个核心操作未在当前容器中声明（可能不需要）\n`);
    return true;
  } else {
    log('\n⚠️  有测试失败，请修复容器定义\n');
    return false;
  }
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  log(`\n[FATAL] ${err.message}`);
  console.error(err);
  process.exit(1);
});
