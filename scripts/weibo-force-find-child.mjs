/**
 * 强制执行 find-child 操作（修复版）
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('Forcing find-child on feed list...');
  
  // 1. Ensure session exists in Unified API SessionManager
  // Since Unified API delegates to Browser Service via RemoteSessionManager, 
  // we need to make sure the RemoteSessionManager knows about the session.
  // The session:list call earlier should have synced it, but create ensures it.
  
  await post('/v1/controller/action', {
    action: 'session:create',
    payload: { profile: PROFILE, url: 'https://weibo.com/' }
  });

  // 2. Perform find-child
  // Note: OperationExecutor uses sessionId from payload to look up session
  const result = await post('/v1/controller/action', {
    action: 'container:operation',
    payload: {
      containerId: 'weibo_main_page.feed_list',
      operationId: 'find-child',
      config: { container_id: 'weibo_main_page.feed_post' },
      sessionId: PROFILE
    }
  });
  
  console.log('Find-child result:', JSON.stringify(result, null, 2));
  
  // 3. Inspect again to verify
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId: 'weibo_main_page.feed_list',
      maxChildren: 20
    }
  });
  
  const children = inspect.data?.data?.snapshot?.children || [];
  console.log(`Children found after find-child: ${children.length}`);
  children.forEach(c => console.log(`- ${c.id} (${c.match_count || 0} matches)`));
}

main().catch(console.error);
