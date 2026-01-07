/**
 * UI 连线诊断脚本
 * 通过注入诊断代码到渲染进程，检查连线绘制的关键状态
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
  log('test-ui-connection-diag', 'runAction', { action, params });
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
  log('test-ui-connection-diag', 'start', {});

  console.log('🔍 UI连线诊断测试');
  console.log('==================');

  await sleep(2000);

  // 1. 容器匹配
  console.log('1️⃣  执行容器匹配...');
  const match = await runAction('containers:match', {
    profile: 'weibo_fresh',
    url: 'https://weibo.com'
  });
  
  if (!match.success || !match.data?.matched) {
    console.error('❌ 容器匹配失败:', match);
    process.exit(1);
  }
  
  const tree = match.data.snapshot.container_tree;
  console.log('✅ 容器匹配成功');
  console.log('   根容器:', tree.id);
  console.log('   子容器数量:', tree.children?.length || 0);
  
  // 打印子容器的匹配信息
  if (tree.children && tree.children.length > 0) {
    tree.children.forEach((child, i) => {
      const childId = child.id || child.name;
      const hasMatch = child.match && child.match.nodes && child.match.nodes.length > 0;
      const matchPath = hasMatch ? child.match.nodes[0].dom_path : 'N/A';
      console.log(`   子容器[${i}]: ${childId}`);
      console.log(`      匹配: ${hasMatch ? '✅' : '❌'}`);
      console.log(`      DOM路径: ${matchPath}`);
      
      log('test-ui-connection-diag', 'child-container', {
        index: i,
        id: childId,
        hasMatch,
        domPath: matchPath
      });
    });
  }

  // 2. 检查DOM树
  console.log('\n2️⃣  检查DOM树获取...');
  const domResp = await runAction('dom:branch:2', {
    profile: 'weibo_fresh',
    url: 'https://weibo.com',
    path: 'root',
    maxDepth: 15,
    maxChildren: 10
  });
  
  if (!domResp.success || !domResp.data?.node) {
    console.error('❌ DOM树获取失败');
    process.exit(1);
  }
  
  console.log('✅ DOM树获取成功');
  const domTree = domResp.data.node;
  
  // 检查子容器的DOM路径是否存在于DOM树中
  console.log('\n3️⃣  验证子容器DOM路径是否在DOM树中...');
  
  function findDomNodeByPath(node, targetPath) {
    if (!node || typeof node !== 'object') return null;
    if (node.path === targetPath) return node;
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findDomNodeByPath(child, targetPath);
        if (found) return found;
      }
    }
    return null;
  }
  
  if (tree.children && tree.children.length > 0) {
    tree.children.forEach((child, i) => {
      const childId = child.id || child.name;
      const hasMatch = child.match && child.match.nodes && child.match.nodes.length > 0;
      
      if (hasMatch) {
        const matchPath = child.match.nodes[0].dom_path;
        const domNode = findDomNodeByPath(domTree, matchPath);
        const found = Boolean(domNode);
        
        console.log(`   子容器[${i}] ${childId}:`);
        console.log(`      路径: ${matchPath}`);
        console.log(`      DOM节点: ${found ? '✅ 找到' : '❌ 未找到'}`);
        
        if (found) {
          console.log(`      标签: ${domNode.tag}`);
          console.log(`      ID: ${domNode.id || 'N/A'}`);
          console.log(`      类名: ${domNode.classes?.[0] || 'N/A'}`);
        }
        
        log('test-ui-connection-diag', 'dom-path-check', {
          childId,
          matchPath,
          found,
          domNode: found ? { tag: domNode.tag, id: domNode.id, classes: domNode.classes } : null
        });
      }
    });
  }

  console.log('\n4️⃣  诊断建议：');
  console.log('   请打开浮窗UI，检查以下项目：');
  console.log('   1. 容器树是否正确展开（包括根容器和子容器）');
  console.log('   2. DOM树是否包含子容器对应的深层路径');
  console.log('   3. 是否有连线从子容器指向DOM节点');
  console.log('   4. 查看浏览器控制台日志：');
  console.log('      - [renderDomNodeRecursive] Registered deep node');
  console.log('      - [drawConnectionsForNode] Drawing connection');
  console.log('      - [drawConnectionsForNode] Drew connection');
  console.log('');
  console.log('   日志位置: ~/.webauto/logs/debug.jsonl');
  
  log('test-ui-connection-diag', 'complete', {});
}

main().catch(err => {
  log('test-ui-connection-diag', 'error', { error: String(err) });
  console.error('❌ 诊断失败:', err);
});
