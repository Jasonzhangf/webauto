/**
 * 微博手动提取测试
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
  console.log('Inspecting feed list...');
  
  // 1. Inspect feed list to get children
  const inspect = await post('/v1/controller/action', {
    action: 'containers:inspect-container',
    payload: {
      profile: PROFILE,
      containerId: 'weibo_main_page.feed_list',
      maxChildren: 20
    }
  });
  
  const children = inspect.data?.data?.snapshot?.children || [];
  console.log(`Found ${children.length} children in feed list`);
  
  // 2. Filter posts
  const posts = children.filter(c => c.id.includes('feed_post'));
  console.log(`Found ${posts.length} posts`);
  
  if (posts.length > 0) {
    const post = posts[0];
    console.log('Extracting post:', post.id);
    
    // 3. Extract post
    const extract = await post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: post.id,
        operationId: 'extract',
        config: {
          fields: {
            author: "header a[href*='weibo.com']",
            content: "div[class*='detail_wbtext']",
            timestamp: "time",
            url: "a[href*='weibo.com'][href*='/status/']",
            authorUrl: "a[href*='weibo.com/u/']"
          },
          include_text: true
        },
        sessionId: PROFILE
      }
    });
    
    console.log('Extraction result:', JSON.stringify(extract.data?.data, null, 2));
  }
}

main().catch(console.error);
