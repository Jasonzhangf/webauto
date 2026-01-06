import fs from 'fs';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';
const PAGE_URL = 'https://weibo.com/';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function main() {
  console.log('Matching containers...');
  const match = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      url: PAGE_URL,
      maxDepth: 3,
      maxChildren: 10
    }
  });
  
  if (match.data) {
    fs.writeFileSync('debug_match_snapshot.json', JSON.stringify(match.data, null, 2));
    console.log('Snapshot saved to debug_match_snapshot.json');
    
    const root = match.data.snapshot.root_match?.container || match.data.snapshot.container_tree;
    console.log('Root children:', root.children?.map(c => c.id));
  } else {
    console.log('No match data');
  }
}

main().catch(console.error);
