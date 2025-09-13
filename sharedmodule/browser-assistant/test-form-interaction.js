/**
 * 微博表单交互测试
 * 测试搜索、发布、评论等表单功能
 */

const { CamoufoxManager } = require('../dist-simple/browser/CamoufoxManager');

async function testFormInteraction() {
  console.log('📝 开始微博表单填写和提交测试...\n');
  
  const browserManager = new CamoufoxManager({
    headless: false,
    autoInjectCookies: true,
    waitForLogin: false,
    targetDomain: 'weibo.com'
  });

  try {
    // 自动登录
    console.log('🔑 自动登录中...');
    await browserManager.initializeWithAutoLogin('https://weibo.com/home');
    
    const page = await browserManager.getCurrentPage();
    
    // 测试1: 搜索表单功能
    console.log('🔍 测试1: 搜索表单功能');
    await page.waitForTimeout(3000);
    
    // 查找搜索输入框
    const searchInputs = await page.$$('input[placeholder*="搜索"], input[type="search"], input[name*="search"]');
    
    if (searchInputs.length > 0) {
      const searchInput = searchInputs[0];
      
      // 获取搜索框的当前值
      const initialValue = await searchInput.inputValue();
      console.log(`   ✅ 找到搜索框，当前值: "${initialValue}"`);
      
      // 尝试聚焦搜索框
      await searchInput.focus();
      await page.waitForTimeout(1000);
      
      // 输入测试搜索词
      console.log('   📝 输入搜索词: "浏览器自动化测试"');
      await searchInput.fill('浏览器自动化测试');
      await page.waitForTimeout(1000);
      
      // 验证输入成功
      const newValue = await searchInput.inputValue();
      console.log(`   ✅ 搜索框新值: "${newValue}"`);
      
      // 清空搜索框（不实际提交搜索，避免产生垃圾数据）
      await searchInput.fill('');
      console.log('   🧹 已清空搜索框');
      
    } else {
      console.log('   ❌ 未找到搜索框');
    }
    console.log('');
    
    // 测试2: 发布微博表单
    console.log('✏️ 测试2: 发布微博表单');
    
    // 查找发布相关区域
    const publishAreas = await page.$$('[class*="publish"], [class*="post"], [class*="editor"], textarea');
    
    if (publishAreas.length > 0) {
      console.log(`   ✅ 找到 ${publishAreas.length} 个发布相关区域`);
      
      // 查找文本输入区域
      const textAreas = await page.$$('textarea[placeholder*="微博"], textarea[placeholder*="分享"], [contenteditable="true"]');
      
      if (textAreas.length > 0) {
        const textArea = textAreas[0];
        
        // 尝试聚焦并输入测试内容
        console.log('   📝 尝试输入测试内容...');
        await textArea.focus();
        await page.waitForTimeout(500);
        
        // 输入测试文本但不提交
        const testText = '这是自动化测试内容，不会实际发布';
        await textArea.fill(testText);
        await page.waitForTimeout(1000);
        
        // 验证输入成功
        const content = await textArea.inputValue();
        console.log(`   ✅ 成功输入内容: "${content}" (长度: ${content.length})`);
        
        // 清空内容
        await textArea.fill('');
        console.log('   🧹 已清空输入内容');
        
      } else {
        console.log('   ❌ 未找到文本输入区域');
      }
      
      // 查找发布按钮
      const publishButtons = await page.$$('button[class*="publish"], button[class*="post"], input[type="submit"]');
      console.log(`   🔘 找到发布按钮: ${publishButtons.length} 个`);
      
      publishButtons.forEach((btn, i) => {
        console.log(`     按钮${i+1}: ${btn.textContent?.trim() || '无文本'}`);
      });
      
    } else {
      console.log('   ❌ 未找到发布区域');
    }
    console.log('');
    
    // 测试3: 评论表单功能
    console.log('💬 测试3: 评论表单功能');
    
    // 查找微博卡片
    const weiboCards = await page.$$('[class*="feed"], [class*="card"], article').slice(0, 3);
    
    if (weiboCards.length > 0) {
      console.log(`   ✅ 找到 ${weiboCards.length} 个微博卡片用于测试评论`);
      
      // 在第一个微博卡片中查找评论输入框
      const firstCard = weiboCards[0];
      const commentInputs = await firstCard.$$('textarea[placeholder*="评论"], input[placeholder*="评论"], [class*="comment"] input');
      
      if (commentInputs.length > 0) {
        const commentInput = commentInputs[0];
        
        console.log('   📝 找到评论输入框，测试输入功能...');
        await commentInput.focus();
        await page.waitForTimeout(500);
        
        // 输入测试评论但不提交
        const testComment = '自动化测试评论';
        await commentInput.fill(testComment);
        await page.waitForTimeout(500);
        
        const commentValue = await commentInput.inputValue();
        console.log(`   ✅ 评论输入成功: "${commentValue}"`);
        
        // 清空评论
        await commentInput.fill('');
        console.log('   🧹 已清空评论输入');
        
      } else {
        console.log('   ❌ 未找到评论输入框');
      }
      
      // 查找评论按钮
      const commentButtons = await firstCard.$$('button[class*="comment"], a[class*="comment"]');
      console.log(`   💬 找到评论按钮: ${commentButtons.length} 个`);
      
    } else {
      console.log('   ❌ 未找到微博卡片');
    }
    console.log('');
    
    // 测试4: 表单验证和状态检查
    console.log('✅ 测试4: 表单验证和状态检查');
    
    // 检查页面中的各种输入元素状态
    const formElements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
      return inputs.map(el => ({
        type: el.type || el.tagName.toLowerCase(),
        placeholder: el.placeholder || '',
        disabled: el.disabled,
        readonly: el.readOnly,
        required: el.required,
        value: el.value || '',
        maxLength: el.maxLength || -1,
        className: el.className
      })).filter(item => 
        item.placeholder.length > 0 || 
        item.type === 'text' || 
        item.type === 'search' || 
        item.type === 'textarea'
      );
    });
    
    console.log(`   📊 找到 ${formElements.length} 个表单元素`);
    console.log('   📝 表单元素详情:');
    formElements.slice(0, 5).forEach((element, i) => {
      console.log(`     ${i+1}. 类型: ${element.type}`);
      console.log(`        提示: ${element.placeholder || '无'}`);
      console.log(`        禁用: ${element.disabled ? '是' : '否'}`);
      console.log(`        只读: ${element.readonly ? '是' : '否'}`);
      console.log(`        必填: ${element.required ? '是' : '否'}`);
    });
    console.log('');
    
    // 测试5: 表单交互事件
    console.log('🎯 测试5: 表单交互事件');
    
    // 查找可点击的表单相关元素
    const interactiveElements = await page.$$('button, [role="button"], [onclick], .clickable, [class*="btn"]').slice(0, 10);
    
    console.log(`   🖱️ 找到 ${interactiveElements.length} 个可交互元素`);
    
    // 模拟悬停事件（不实际点击）
    if (interactiveElements.length > 0) {
      const testElement = interactiveElements[0];
      
      // 获取悬停前的样式
      const beforeHover = await testElement.evaluate(el => ({
        backgroundColor: window.getComputedStyle(el).backgroundColor,
        color: window.getComputedStyle(el).color
      }));
      
      console.log('   🖱️ 测试悬停效果...');
      await testElement.hover();
      await page.waitForTimeout(500);
      
      // 获取悬停后的样式
      const afterHover = await testElement.evaluate(el => ({
        backgroundColor: window.getComputedStyle(el).backgroundColor,
        color: window.getComputedStyle(el).color
      }));
      
      const bgColorChanged = beforeHover.backgroundColor !== afterHover.backgroundColor;
      const colorChanged = beforeHover.color !== afterHover.color;
      
      console.log(`   ✅ 悬停效果 - 背景色变化: ${bgColorChanged ? '是' : '否'}`);
      console.log(`   ✅ 悬停效果 - 文字色变化: ${colorChanged ? '是' : '否'}`);
    }
    console.log('');
    
    // 测试6: 键盘事件
    console.log('⌨️ 测试6: 键盘事件模拟');
    
    // 找到一个可输入的元素进行键盘测试
    const testInputs = await page.$$('input[type="text"], textarea').slice(0, 2);
    
    if (testInputs.length > 0) {
      const testInput = testInputs[0];
      
      console.log('   ⌨️ 测试键盘输入...');
      await testInput.focus();
      await page.waitForTimeout(300);
      
      // 模拟键盘输入
      await testInput.type('Hello World', { delay: 100 });
      await page.waitForTimeout(500);
      
      const typedValue = await testInput.inputValue();
      console.log(`   ✅ 键盘输入成功: "${typedValue}"`);
      
      // 测试删除操作
      await testInput.press('Backspace', { times: 5 });
      await page.waitForTimeout(300);
      
      const afterDelete = await testInput.inputValue();
      console.log(`   ✅ 删除操作成功: "${afterDelete}"`);
      
      // 清空
      await testInput.fill('');
      console.log('   🧹 已清空测试输入');
    }
    console.log('');
    
    console.log('🎉 表单填写和提交测试完成！');
    console.log('⚠️  注意：所有测试均为模拟操作，未实际提交任何数据');
    console.log('⏳ 浏览器将保持打开15秒供观察...');
    await page.waitForTimeout(15000);
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    console.log('🧹 清理资源...');
    await browserManager.cleanup();
    console.log('✅ 测试完成');
  }
}

// 运行测试
testFormInteraction().catch(console.error);