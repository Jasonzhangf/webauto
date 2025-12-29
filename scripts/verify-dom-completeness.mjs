async function main() {
  const profile = 'weibo_fresh';
  const url = 'https://weibo.com';
  
  console.log('[Verify] 执行容器匹配...');
  const res = await fetch('http://127.0.0.1:7701/v1/controller/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'containers:match',
      payload: { profile, url, maxDepth: 4 }
    })
  });
  
  const result = await res.json();
  if (!result.success) {
    console.error('[Verify] 匹配失败:', result.error);
    process.exit(1);
  }

  const payload = result.data.payload || result.data;
  const matches = payload.snapshot.matches;
  const domTree = payload.snapshot.container_tree?.dom_tree || payload.dom_tree || payload.snapshot.dom_tree;

  if (!domTree) {
     console.error('[Verify] 无法在响应中找到 dom_tree');
     process.exit(1);
  }

  console.log('[Verify] 检查深层节点是否强制包含...');
  
  let totalConnections = 0;
  let brokenConnections = 0;
  let maxDepthIncluded = 0;

  for (const [id, match] of Object.entries(matches)) {
    if (!match.nodes || match.nodes.length === 0) continue;
    
    for (const node of match.nodes) {
      const path = node.dom_path;
      if (!path) continue;
      
      totalConnections++;
      const pathParts = path.split('/').slice(1);
      maxDepthIncluded = Math.max(maxDepthIncluded, pathParts.length);
      
      let current = domTree;
      let found = true;
      
      for (const idx of pathParts) {
        const numIdx = parseInt(idx, 10);
        if (current && current.children && current.children[numIdx]) {
          current = current.children[numIdx];
        } else {
          found = false;
          break;
        }
      }
      
      if (found) {
        console.log(`✓ 节点路径已包含 (深度 ${pathParts.length}): ${path} [${id}]`);
      } else {
        console.error(`✗ 节点路径缺失: ${path} [${id}] (最大允许 4)`);
        brokenConnections++;
      }
    }
  }

  console.log(`\n统计信息:`);
  console.log(`- 总匹配点: ${totalConnections}`);
  console.log(`- 包含成功: ${totalConnections - brokenConnections}`);
  console.log(`- 包含失败: ${brokenConnections}`);
  console.log(`- 最大探测深度: ${maxDepthIncluded}`);

  if (brokenConnections === 0 && totalConnections > 0) {
    console.log('\n[SUCCESS] 验证通过：所有匹配的深层节点均已强制包含在初始 DOM 树中！ 🎉');
  } else {
    console.error(`\n[FAILED] 验证失败：共有 ${brokenConnections}/${totalConnections} 个连接失效。`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Verify script error:', err);
  process.exit(1);
});
