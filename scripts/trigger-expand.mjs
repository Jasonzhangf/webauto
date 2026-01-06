/**
 * 触发展开操作脚本
 * 
 * 目标：强制触发展开按钮的点击，验证 auto_click 机制是否工作
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
  console.log('Triggering containers:match to discover expand buttons...');
  
  // 1. 匹配容器以触发 appear 事件
  const match = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      url: 'https://weibo.com/',
      maxDepth: 3,
      maxChildren: 10
    }
  });
  
  if (match.success) {
    console.log('Match triggered, waiting for events...');
    // 等待事件处理
    await new Promise(r => setTimeout(r, 5000));
    console.log('Done');
  } else {
    console.error('Match failed:', match.error);
  }
}

main().catch(console.error);
