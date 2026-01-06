/**
 * 深度检查容器结构
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function main() {
  console.log('Inspecting page...');
  
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect',
    payload: {
      profile: PROFILE,
      url: 'https://weibo.com/',
      maxDepth: 4,
      maxChildren: 20
    }
  });
  
  if (!inspect.data) {
    console.log('No data returned');
    return;
  }

  const snapshot = inspect.data.snapshot;
  const root = snapshot.root_match?.container || snapshot.container_tree;
  
  console.log('Root:', root.id);
  
  if (root.children) {
    console.log(`Root has ${root.children.length} children`);
    root.children.forEach(child => {
      console.log(`- ${child.id} (${child.name})`);
      if (child.children) {
        child.children.forEach(grandChild => {
          console.log(`  - ${grandChild.id} (${grandChild.name}) - ${grandChild.match?.match_count || 0} matches`);
        });
      }
    });
  }
}

main().catch(console.error);
