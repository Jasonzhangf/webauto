/**
 * 测试更新后的微博主页捕获工具
 * 验证新的链接格式识别是否正常工作
 */

const { CamoufoxManager } = require('./dist-simple/browser/CamoufoxManager');
const WeiboHomepageCapture = require('./weibo-homepage-capture');

async function testUpdatedSelectors() {
  console.log('🧪 测试更新后的选择器逻辑...');
  
  const captureTool = new WeiboHomepageCapture();
  
  try {
    // 初始化
    await captureTool.initialize();
    
    // 测试主页帖子捕获
    console.log('🏠 测试主页帖子捕获...');
    const posts = await captureTool.captureHomepagePosts(10);
    
    console.log(`\n📊 捕获结果:`);
    console.log(`  总共捕获: ${posts.length} 条帖子`);
    
    if (posts.length > 0) {
      console.log('\n📝 捕获的帖子详情:');
      posts.forEach((post, index) => {
        console.log(`\n  帖子 ${index + 1}:`);
        console.log(`    ID: ${post.id}`);
        console.log(`    URL: ${post.url}`);
        console.log(`    用户: ${post.username}`);
        console.log(`    内容长度: ${post.content.length} 字符`);
        console.log(`    容器类: ${post.containerClass}`);
        console.log(`    页面类型: ${post.pageType}`);
        
        // 显示内容摘要
        const contentPreview = post.content.length > 50 
          ? post.content.substring(0, 50) + '...' 
          : post.content;
        console.log(`    内容: "${contentPreview}"`);
      });
      
      // 分析URL格式
      console.log('\n🔗 URL格式分析:');
      const urlFormats = posts.reduce((acc, post) => {
        if (post.url.includes('/status/')) {
          acc.status = (acc.status || 0) + 1;
        } else if (post.url.includes('/detail/')) {
          acc.detail = (acc.detail || 0) + 1;
        } else if (post.url.match(/weibo\.com\/\d+\/[A-Za-z0-9]+/)) {
          acc.newFormat = (acc.newFormat || 0) + 1;
        } else {
          acc.other = (acc.other || 0) + 1;
        }
        return acc;
      }, {});
      
      Object.entries(urlFormats).forEach(([format, count]) => {
        console.log(`  ${format}: ${count} 个`);
      });
      
      console.log('\n✅ 选择器更新测试成功！');
      
    } else {
      console.log('❌ 未捕获到任何帖子');
    }
    
    return posts;
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    throw error;
  } finally {
    await captureTool.cleanup();
  }
}

// 运行测试
testUpdatedSelectors().catch(console.error);