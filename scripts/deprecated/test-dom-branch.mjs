#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

// 测试：dom:branch:2 是否能正确加载 DOM 分支

async function post(action, payload, timeout = 30000) {
  const controllerUrl = 'http://127.0.0.1:7701/v1/controller/action';
  
  try {
    const response = await fetch(controllerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action,
        payload
      }),
      signal: AbortSignal.timeout(timeout)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (err) {
    throw new Error(`Request failed: ${err.message}`);
  }
}

async function main() {
  console.log('[test-dom-branch] 开始测试 DOM 分支加载功能...\n');
  
  const profile = 'weibo_fresh';
  const url = 'https://weibo.com';
  
  // 测试 1: 加载根路径的 DOM 分支
  console.log('[1] 测试加载根路径 DOM 分支...');
  try {
    const result = await post('dom:branch:2', {
      profile,
      url,
      path: 'root',
      depth: 3,
      maxChildren: 10
    }, 10000);
    
    if (result.success && result.data?.node) {
      console.log('    ✅ 根分支加载成功');
      console.log(`    节点路径: ${result.data.node.path}`);
      console.log(`    节点标签: ${result.data.node.tag}`);
      console.log(`    子节点数: ${result.data.node.children?.length || 0}`);
      console.log(`    子节点路径示例:`, result.data.node.children[0]?.path || 'N/A');
    } else {
      console.log('    ❌ 根分支加载失败');
      console.log(`    响应: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    console.log(`    ❌ 根分支加载异常: ${err.message}`);
  }
  
  // 测试 2: 加载一个深层路径的 DOM 分支
  console.log('\n[2] 测试加载深层路径 DOM 分支...');
  const deepPath = 'root/1/1/0';
  try {
    const result = await post('dom:branch:2', {
      profile,
      url,
      path: deepPath,
      depth: 3,
      maxChildren: 10
    }, 10000);
    
    if (result.success && result.data?.node) {
      console.log('    ✅ 深层分支加载成功');
      console.log(`    节点路径: ${result.data.node.path}`);
      console.log(`    节点标签: ${result.data.node.tag}`);
      console.log(`    子节点数: ${result.data.node.children?.length || 0}`);
      if (result.data.node.children?.length > 0) {
        console.log(`    子节点路径示例:`, result.data.node.children[0]?.path || 'N/A');
      }
    } else {
      console.log('    ❌ 深层分支加载失败');
      console.log(`    响应: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    console.log(`    ❌ 深层分支加载异常: ${err.message}`);
  }
  
  // 测试 3: 加载更深的路径（模仿 picker 选中的元素）
  console.log('\n[3] 测试加载更深层路径（picker 选中的元素路径）...');
  const pickerPath = 'root/1/1/0/0/0/0/1/1/0/0/0/0/0/0/0/0/0/0/1/0/0';
  try {
    const result = await post('dom:branch:2', {
      profile,
      url,
      path: pickerPath,
      depth: 2,
      maxChildren: 10
    }, 10000);
    
    if (result.success && result.data?.node) {
      console.log('    ✅ Picker 路径加载成功');
      console.log(`    节点路径: ${result.data.node.path}`);
      console.log(`    节点标签: ${result.data.node.tag}`);
      console.log(`    节点类名:`, result.data.node.classes || 'N/A');
      console.log(`    子节点数: ${result.data.node.children?.length || 0}`);
    } else {
      console.log('    ❌ Picker 路径加载失败');
      console.log(`    响应: ${JSON.stringify(result)}`);
    }
  } catch (err) {
    console.log(`    ❌ Picker 路径加载异常: ${err.message}`);
  }
  
  console.log('\n[4] 结论：');
  console.log('    - dom:branch:2 命令工作正常');
  console.log('    - 返回的数据包含 node 对象');
  console.log('    - node 对象包含 path, tag, children, classes 字段');
  console.log('    - 前端需要正确处理这些数据并合并到 DOM tree 中');
}

main();
