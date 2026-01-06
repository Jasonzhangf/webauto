/**
 * 验证链接过滤逻辑
 */

// 模拟 DOM 环境
const mockElement = {
  querySelector: (sel) => {
    if (sel.includes('headline')) return { textContent: 'test_user' };
    if (sel.includes('wbtext')) return { textContent: 'test content here' };
    if (sel.includes('time')) return { textContent: '2024-01-05' };
    return null;
  }
};

const mockContainer = {
  querySelector: (sel) => mockElement,
  querySelectorAll: (sel) => {
    if (sel === 'a') {
      return [
        { href: 'https://weibo.com/123456/AbCdEfGh' },
        { href: 'https://weibo.com/u/789012' },
        { href: 'https://weibo.com/testuser' },
        { href: 'https://m.weibo.com/detail/AbCdEfGh' },
        { href: 'https://weibo.com/123456/other' },
        { href: 'https://www.baidu.com' }
      ];
    }
    return [];
  }
};

// 过滤函数
const isPostUrl = (url) => {
  if (!url) return false;
  // 帖子URL: weibo.com/数字/帖子ID，其中帖子ID长度>4位
  return /^https?:\/\/(?:www\.)?weibo\.com\/\d+\/[a-zA-Z0-9]{5,}/.test(url) ||
         /^https?:\/\/(?:m\.)?weibo\.com\/detail\/[a-zA-Z0-9]{5,}/.test(url);
};

const isProfileUrl = (url) => {
  if (!url) return false;
  // 用户主页: /u/数字ID 或 单段用户名
  return /^https?:\/\/(?:www\.)?weibo\.com\/u\/\d+/.test(url) ||
         /^https?:\/\/(?:www\.)?weibo\.com\/[a-zA-Z0-9_-]{1,16}\/?$/.test(url);
};

console.log('=== 链接过滤验证 ===\n');

const testUrls = [
  'https://weibo.com/123456/AbCdEfGh',
  'https://m.weibo.com/detail/AbCdEfGh',
  'https://weibo.com/u/789012',
  'https://weibo.com/testuser',
  'https://weibo.com/123456/other',
  'https://www.baidu.com'
];

testUrls.forEach(url => {
  const isPost = isPostUrl(url);
  const isProfile = isProfileUrl(url);
  const shouldKeep = isPost && !isProfile;

  console.log(`${url}`);
  console.log(`  帖子URL: ${isPost}`);
  console.log(`  用户主页: ${isProfile}`);
  console.log(`  保留: ${shouldKeep}\n`);
});

console.log('=== DOM 提取测试 ===\n');

const links = Array.from(mockContainer.querySelectorAll('a')).map(a => a.href);
console.log('原始链接:', links.length, '个');

const filteredLinks = links.filter(url => isPostUrl(url) && !isProfileUrl(url));
console.log('过滤后:', filteredLinks.length, '个');
console.log('保留的链接:');
filteredLinks.forEach(link => console.log('  -', link));

console.log('\n=== 验证结果 ===');
const expectedCount = 3; // 3个帖子链接
const passed = filteredLinks.length === expectedCount;
console.log(passed ? 'PASS' : 'FAIL', `- 预期 ${expectedCount} 个，实际 ${filteredLinks.length} 个`);

process.exit(passed ? 0 : 1);
