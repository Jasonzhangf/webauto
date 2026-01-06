/**
 * Step 2: 容器加载验证脚本（Workflow Blocks）
 *
 * 核心目标：将容器加载逻辑固化为可组合的 Workflow 基本程序块
 */

import fs from 'fs/promises';
import path from 'path';

const CONTAINER_LIB_ROOT = path.join(process.cwd(), 'container-library');
const WEIBO_LIB = path.join(CONTAINER_LIB_ROOT, 'weibo');

// 核心容器定义（必须存在）
const REQUIRED_CONTAINERS = {
  'weibo_login': { name: '微博登录容器', type: 'page' },
  'weibo_login.username_input': { name: '用户名输入框', type: 'input' },
  'weibo_login.password_input': { name: '密码输入框', type: 'input' },
  'weibo_login.login_button': { name: '登录按钮', type: 'button' },
  'weibo_main_page': { name: '微博主页面（已登录）', type: 'page' },
  'weibo_main_page.feed_list': { name: '微博内容列表', type: 'collection' },
  'weibo_main_page.feed_post': { name: '微博单条帖子', type: 'content' },
  'weibo_main_page.woo_input_main_mjwyu11q': { name: '.woo-input-main', type: 'section' },
  'weibo_profile_page': { name: '微博个人主页', type: 'page' },
  'weibo_profile_page.post_item': { name: '个人主页-单条内容', type: 'content' },
  'weibo_profile_page.feed_list': { name: '个人主页-列表容器', type: 'list' },
  'weibo_detail_page': { name: '微博详情页（独立内容页）', type: 'page' },
  'weibo_detail_page.post_content': { name: '详情页-内容容器', type: 'content' },
  'weibo_detail_page.comment_list': { name: '详情页-评论列表', type: 'list' },
  'weibo_search_page': { name: '微博搜索页（未登录/已登录均可）', type: 'page' },
  'weibo_search_page.search_list': { name: '搜索页-列表容器', type: 'list' },
  'weibo_search_page.search_item': { name: '搜索页-单条内容', type: 'content' }
};

async function main() {
  console.log('=== Step 2: 容器加载验证脚本 ===');

  // 1. 加载容器索引
  console.log('\n1. 加载容器索引...');
  const indexFile = path.join(process.cwd(), 'container-library.index.json');

  if (!fs.existsSync(indexFile)) {
    console.error('❌ 容器索引文件不存在:', indexFile);
    process.exit(1);
  }

  const indexContent = await fs.readFile(indexFile, 'utf-8');
  const index = JSON.parse(indexContent);
  console.log('索引加载完成');
  console.log('  - 站点数量:', Object.keys(index).length);

  // 2. 检查微博容器定义
  const weiboIndex = index.weibo;
  if (!weiboIndex) {
    console.error('❌ 索引中缺少 weibo 条目');
    process.exit(1);
  }

  console.log('\n2. 验证容器定义...');
  const coreResults = [];
  const missing = [];
  const existing = [];

  for (const [containerId, info] of Object.entries(REQUIRED_CONTAINERS)) {
    const containerPath = path.join(WEIBO_LIB, ...containerId.split('.').filter(Boolean), 'container.json');
    const exists = fs.existsSync(containerPath);

    if (exists) {
      try {
        const content = await fs.readFile(containerPath, 'utf-8');
        const containerDef = JSON.parse(content);
        coreResults.push({
          containerId,
          name: info.name,
          type: info.type,
          status: 'exists',
          path: containerPath,
          selectors: Array.isArray(containerDef.selectors) ? containerDef.selectors.length : 'object',
          operations: Array.isArray(containerDef.operations) ? containerDef.operations.length : 0
        });
        existing.push(containerId);
      } catch (error) {
        console.error(`❌ 解析失败 ${containerId}:`, error.message);
        coreResults.push({
          containerId,
          name: info.name,
          type: info.type,
          status: 'error',
          path: containerPath,
          error: error.message
        });
        missing.push(containerId);
      }
    } else {
      missing.push(containerId);
      coreResults.push({
        containerId,
        name: info.name,
        type: info.type,
        status: 'missing',
        path: containerPath
      });
    }
  }

  console.log('\n3. 核心容器检查结果:');
  console.table(coreResults.map(r => ({
    ID: r.containerId,
    Name: r.name,
    Type: r.type,
    Status: r.status,
    Selectors: r.selectors,
    Operations: r.operations
  })));

  if (missing.length > 0) {
    console.error('\n❌ 缺失的核心容器:');
    missing.forEach(id => console.error('  -', id));
    process.exit(1);
  }

  console.log(`\n✅ 所有核心容器定义已存在 (${existing.length}/${coreResults.length})`);

  // 4. 输出验证结果
  const output = {
    step: 'verify-container-library',
    status: 'success',
    timestamp: new Date().toISOString(),
    results: {
      coreContainers: coreResults,
      summary: {
        total: coreResults.length,
        existing: coreResults.filter(r => r.status === 'exists').length,
        missing: missing.length
      }
    }
  };

  const outputFile = path.join(process.cwd(), 'task-output', 'step2-verify-container-library.json');
  await fs.writeFile(outputFile, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Step 2 完成`);
  console.log(`📁 输出: ${outputFile}`);
  console.log('='.repeat(50));
}

main().catch(error => {
  console.error('❌ 执行失败:', error);
  process.exit(1);
});
