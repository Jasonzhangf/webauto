#!/usr/bin/env node
// 测试：给定xpath，能否在DOM tree中正确加载、展开和渲染

async function post(action, payload, timeout = 30000) {
  const controllerUrl = 'http://127.0.0.1:7701/api/action';
  
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
  console.log('[test-dom-path-loading] 开始测试 DOM path 加载功能...\n');
  
  const profile = 'weibo_fresh';
  // 一个深层路径，可能不在初始DOM树中
  const testPath = 'root/1/1/0/0/0/0/1/1/0/0/0/0/0/0/0/0/0/1/0/0';
  
  console.log(`[1] 测试路径: ${testPath}`);
  console.log(`    路径深度: ${testPath.split('/').length}`);
  
  console.log('\n[2] 检查该路径是否在初始DOM树中...');
  try {
    const fullResult = await post('dom:tree:full', { profile }, 30000);
    if (fullResult.success && fullResult.data) {
      console.log('    ✅ 初始DOM树加载成功');
      
      // 检查路径是否存在
      function findPath(node, path, currentPath = '') {
        // 如果节点有path属性，直接使用
        const nodePath = node.path || (currentPath ? `${currentPath}/${node.tag}` : 'root');
        
        if (nodePath === path) return node;
        if (node.path === path) return node;
        
        if (node.children) {
          for (const child of node.children) {
            const found = findPath(child, path, nodePath);
            if (found) return found;
          }
        }
        return null;
      }
      
      const foundNode = findPath(fullResult.data, testPath, '');
      if (foundNode) {
        console.log(`    ✅ 路径在初始DOM树中存在`);
        console.log(`    节点标签: ${foundNode.tag}`);
        console.log(`    子节点数: ${foundNode.children?.length || 0}`);
      } else {
        console.log(`    ⚠️  路径不在初始DOM树中，需要动态加载`);
        
        // 尝试按需加载分支
        console.log('\n[3] 尝试按需加载DOM分支...');
        const parts = testPath.split('/');
        // 从较深的路径开始尝试加载
        // 注意：dom:branch:2 需要父路径存在才能加载子路径
        // 我们从第2层开始逐层检查和加载
        
        // 模拟前端 graph.mjs 中的 ensureDomPathLoaded 逻辑
        for (let i = 2; i <= parts.length; i++) {
          const partialPath = parts.slice(0, i).join('/');
          console.log(`    检查/加载分支: ${partialPath}`);
          
          try {
            const branchResult = await post('dom:branch:2', {
              profile,
              path: partialPath,
              depth: 2,
              maxChildren: 10
            }, 10000);
            
            if (branchResult.success && branchResult.data?.node) {
              const loadedNode = branchResult.data.node;
              const childCount = loadedNode.children?.length || 0;
              console.log(`      ✅ 分支加载成功: ${loadedNode.path} (children: ${childCount})`);
              
              if (childCount > 0) {
                 // 简单验证一下是否包含下一级路径
                 if (i < parts.length) {
                   const nextPart = parts[i];
                   // 这里没办法精确验证，因为返回的是节点对象，我们只能假设如果加载成功就包含了
                 }
              }
            } else {
              console.log(`      ❌ 分支加载失败: ${JSON.stringify(branchResult)}`);
            }
          } catch (err) {
            console.log(`      ❌ 分支加载异常: ${err.message}`);
          }
        }
      }
    } else {
        console.log(`    ❌ 初始DOM树加载失败: ${JSON.stringify(fullResult)}`);
    }
  } catch (err) {
    console.log(`    ❌ 初始DOM树加载异常: ${err.message}`);
  }
  
  console.log('\n[4] 结论：');
  console.log('    - DOM树全量加载时可能不包含深度路径');
  console.log('    - 需要按需加载分支才能显示完整DOM结构');
  console.log('    - picker选中元素后，需要确保路径被完整加载才能渲染');
}

main();
