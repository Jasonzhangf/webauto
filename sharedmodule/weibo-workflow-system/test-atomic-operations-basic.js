/**
 * 原子操作功能测试
 * 测试原子操作的基本功能，不依赖外部网站
 */

const { chromium } = require('playwright');
const { AtomicOperationFactory } = require('./src/core/atomic-operations');

class AtomicOperationsTest {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = [];
  }

  async initialize() {
    console.log('🚀 初始化测试环境...');
    
    this.browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1280, height: 720 });
    
    console.log('✅ 测试环境初始化完成');
  }

  async testElementExists() {
    console.log('🧪 测试元素存在检查操作...');
    
    try {
      // 创建一个测试页面
      await this.page.setContent(`
        <html>
          <body>
            <div id="test-div">测试内容</div>
            <a href="https://example.com" class="test-link">示例链接</a>
            <span class="test-text">测试文本</span>
          </body>
        </html>
      `);
      
      // 测试元素存在操作
      const existsOperation = AtomicOperationFactory.createOperation('element.exists', {
        selector: '#test-div',
        timeout: 5000
      });
      
      const result = await existsOperation.execute(this.page);
      
      console.log(`📋 元素存在检查结果: ${result.success ? '成功' : '失败'}`);
      console.log(`   - 元素存在: ${result.result}`);
      
      this.results.push({
        test: 'element.exists',
        success: result.success,
        result: result.result
      });
      
      return result.success;
      
    } catch (error) {
      console.error('❌ 元素存在检查测试失败:', error.message);
      return false;
    }
  }

  async testElementText() {
    console.log('🧪 测试文本提取操作...');
    
    try {
      // 测试单元素文本提取
      const singleTextOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: '#test-div',
        timeout: 5000
      });
      
      const singleResult = await singleTextOperation.execute(this.page);
      
      console.log(`📋 单元素文本提取: ${singleResult.success ? '成功' : '失败'}`);
      console.log(`   - 文本内容: "${singleResult.result}"`);
      
      // 测试多元素文本提取
      const multiTextOperation = AtomicOperationFactory.createOperation('element.text', {
        selector: 'span',
        multiple: true,
        timeout: 5000
      });
      
      const multiResult = await multiTextOperation.execute(this.page);
      
      console.log(`📋 多元素文本提取: ${multiResult.success ? '成功' : '失败'}`);
      console.log(`   - 提取数量: ${multiResult.result ? multiResult.result.length : 0}`);
      
      this.results.push({
        test: 'element.text',
        success: singleResult.success && multiResult.success,
        singleText: singleResult.result,
        multiTextCount: multiResult.result ? multiResult.result.length : 0
      });
      
      return singleResult.success && multiResult.success;
      
    } catch (error) {
      console.error('❌ 文本提取测试失败:', error.message);
      return false;
    }
  }

  async testElementAttribute() {
    console.log('🧪 测试属性提取操作...');
    
    try {
      // 测试单元素属性提取
      const singleAttrOperation = AtomicOperationFactory.createOperation('element.attribute', {
        selector: '.test-link',
        attribute: 'href',
        timeout: 5000
      });
      
      const singleResult = await singleAttrOperation.execute(this.page);
      
      console.log(`📋 单元素属性提取: ${singleResult.success ? '成功' : '失败'}`);
      console.log(`   - 属性值: "${singleResult.result}"`);
      
      // 测试多元素属性提取
      await this.page.setContent(`
        <html>
          <body>
            <a href="https://example1.com" class="link">链接1</a>
            <a href="https://example2.com" class="link">链接2</a>
            <a href="https://example3.com" class="link">链接3</a>
          </body>
        </html>
      `);
      
      const multiAttrOperation = AtomicOperationFactory.createOperation('element.attribute', {
        selector: '.link',
        attribute: 'href',
        multiple: true,
        timeout: 5000
      });
      
      const multiResult = await multiAttrOperation.execute(this.page);
      
      console.log(`📋 多元素属性提取: ${multiResult.success ? '成功' : '失败'}`);
      console.log(`   - 提取数量: ${multiResult.result ? multiResult.result.length : 0}`);
      if (multiResult.result) {
        multiResult.result.forEach((url, i) => {
          console.log(`   - 链接${i + 1}: ${url}`);
        });
      }
      
      this.results.push({
        test: 'element.attribute',
        success: singleResult.success && multiResult.success,
        singleAttr: singleResult.result,
        multiAttrCount: multiResult.result ? multiResult.result.length : 0
      });
      
      return singleResult.success && multiResult.success;
      
    } catch (error) {
      console.error('❌ 属性提取测试失败:', error.message);
      return false;
    }
  }

  async testElementClick() {
    console.log('🧪 测试元素点击操作...');
    
    try {
      // 创建测试页面，包含一个按钮
      await this.page.setContent(`
        <html>
          <body>
            <button id="test-button" onclick="document.body.appendChild(document.createElement('div')).textContent='Clicked!'">点击我</button>
            <div id="result"></div>
          </body>
        </html>
      `);
      
      // 测试点击操作
      const clickOperation = AtomicOperationFactory.createOperation('element.click', {
        selector: '#test-button',
        timeout: 5000
      });
      
      const result = await clickOperation.execute(this.page);
      
      console.log(`📋 元素点击操作: ${result.success ? '成功' : '失败'}`);
      
      // 等待一下，检查点击效果
      await this.page.waitForTimeout(500);
      
      // 检查是否点击成功
      const clickedElement = await this.page.$('div:has-text("Clicked!")');
      const clickEffect = clickedElement ? true : false;
      
      console.log(`   - 点击效果: ${clickEffect ? '成功' : '失败'}`);
      
      this.results.push({
        test: 'element.click',
        success: result.success && clickEffect,
        clickResult: result.result,
        clickEffect: clickEffect
      });
      
      return result.success && clickEffect;
      
    } catch (error) {
      console.error('❌ 元素点击测试失败:', error.message);
      return false;
    }
  }

  async testElementVisible() {
    console.log('🧪 测试元素可见性检查...');
    
    try {
      // 创建测试页面，包含可见和不可见元素
      await this.page.setContent(`
        <html>
          <body>
            <div id="visible-element" style="display: block;">可见元素</div>
            <div id="hidden-element" style="display: none;">隐藏元素</div>
          </body>
        </html>
      `);
      
      // 测试可见元素
      const visibleOperation = AtomicOperationFactory.createOperation('element.visible', {
        selector: '#visible-element',
        timeout: 5000
      });
      
      const visibleResult = await visibleOperation.execute(this.page);
      
      // 测试隐藏元素
      const hiddenOperation = AtomicOperationFactory.createOperation('element.visible', {
        selector: '#hidden-element',
        timeout: 5000
      });
      
      const hiddenResult = await hiddenOperation.execute(this.page);
      
      console.log(`📋 元素可见性检查:`);
      console.log(`   - 可见元素检查: ${visibleResult.success ? '成功' : '失败'} (${visibleResult.result})`);
      console.log(`   - 隐藏元素检查: ${hiddenResult.success ? '成功' : '失败'} (${hiddenResult.result})`);
      
      const testSuccess = visibleResult.success && hiddenResult.success && visibleResult.result && !hiddenResult.result;
      
      this.results.push({
        test: 'element.visible',
        success: testSuccess,
        visibleCheck: visibleResult.result,
        hiddenCheck: hiddenResult.result
      });
      
      return testSuccess;
      
    } catch (error) {
      console.error('❌ 元素可见性检查测试失败:', error.message);
      return false;
    }
  }

  async saveResults() {
    const fs = require('fs').promises;
    const path = require('path');
    
    const outputPath = path.join('./results', 'atomic-operations-test-results.json');
    
    // 确保目录存在
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    const report = {
      testTime: new Date().toISOString(),
      testType: '原子操作功能测试',
      results: this.results,
      summary: {
        totalTests: this.results.length,
        passedTests: this.results.filter(r => r.success).length,
        failedTests: this.results.filter(r => !r.success).length
      }
    };
    
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    
    console.log(`💾 测试结果已保存到: ${outputPath}`);
    return outputPath;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async run() {
    try {
      await this.initialize();
      
      console.log('🔬 开始原子操作功能测试...');
      console.log('='.repeat(50));
      
      // 运行所有测试
      const tests = [
        this.testElementExists.bind(this),
        this.testElementText.bind(this),
        this.testElementAttribute.bind(this),
        this.testElementClick.bind(this),
        this.testElementVisible.bind(this)
      ];
      
      let passedTests = 0;
      
      for (const test of tests) {
        try {
          const success = await test();
          if (success) passedTests++;
          console.log('-'.repeat(30));
        } catch (error) {
          console.error('❌ 测试异常:', error.message);
          console.log('-'.repeat(30));
        }
      }
      
      // 保存结果
      const outputPath = await this.saveResults();
      
      console.log('='.repeat(50));
      console.log('🎉 原子操作功能测试完成！');
      console.log(`📊 测试总结:`);
      console.log(`   - 总测试数: ${tests.length}`);
      console.log(`   - 通过测试: ${passedTests}`);
      console.log(`   - 失败测试: ${tests.length - passedTests}`);
      console.log(`   - 结果文件: ${outputPath}`);
      
      return {
        success: true,
        totalTests: tests.length,
        passedTests: passedTests,
        outputPath: outputPath
      };
      
    } catch (error) {
      console.error('❌ 测试运行失败:', error.message);
      return {
        success: false,
        error: error.message
      };
    } finally {
      await this.cleanup();
    }
  }
}

// 运行测试
if (require.main === module) {
  const test = new AtomicOperationsTest();
  
  test.run().then((result) => {
    if (result.success) {
      console.log('✅ 原子操作功能测试完成');
      process.exit(result.passedTests === result.totalTests ? 0 : 1);
    } else {
      console.log('❌ 原子操作功能测试失败');
      process.exit(1);
    }
  }).catch((error) => {
    console.error('💥 测试异常:', error);
    process.exit(1);
  });
}

module.exports = { AtomicOperationsTest };