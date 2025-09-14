/**
 * 原子化操作使用示例
 * 展示如何使用原子操作构建复杂的网页交互
 */

const { chromium } = require('playwright');
const { 
  AtomicOperationFactory,
  CompositeOperationFactory 
} = require('../src/core/atomic-operations');
const { 
  LinkExtractionCompositeOperation,
  FormSubmissionCompositeOperation,
  ContentExtractionCompositeOperation 
} = require('../src/core/composite-operations');

/**
 * 示例1: 使用原子操作进行链接提取
 */
async function exampleAtomicLinkExtraction() {
  console.log('🔗 原子操作链接提取示例...');
  
  let browser;
  let page;
  
  try {
    // 启动浏览器
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    page = await context.newPage();
    
    // 创建原子操作工厂
    const atomicFactory = new AtomicOperationFactory();
    
    // 创建原子操作
    const linkExistsOperation = atomicFactory.createOperation('element.exists', {
      selector: 'a[href]',
      options: { timeout: 5000 }
    });
    
    const extractHrefsOperation = atomicFactory.createOperation('element.attribute', {
      selector: 'a[href]',
      attribute: 'href',
      options: { multiple: true, timeout: 5000 }
    });
    
    const extractTextsOperation = atomicFactory.createOperation('element.text', {
      selector: 'a[href]',
      options: { multiple: true, timeout: 5000 }
    });
    
    // 导航到测试页面
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    
    // 执行原子操作
    console.log('检查链接是否存在...');
    const existsResult = await linkExistsOperation.execute(page);
    console.log('链接存在:', existsResult.exists);
    
    if (existsResult.exists) {
      console.log('提取链接href...');
      const hrefsResult = await extractHrefsOperation.execute(page);
      console.log('找到', hrefsResult.attributes?.length || 0, '个链接');
      
      console.log('提取链接文本...');
      const textsResult = await extractTextsOperation.execute(page);
      console.log('找到', textsResult.texts?.length || 0, '个链接文本');
      
      // 组合结果
      const links = [];
      const hrefs = hrefsResult.attributes || [];
      const texts = textsResult.texts || [];
      
      for (let i = 0; i < Math.min(hrefs.length, texts.length); i++) {
        links.push({
          href: hrefs[i],
          text: texts[i]
        });
      }
      
      console.log('提取的链接:', links.slice(0, 5)); // 只显示前5个
    }
    
  } catch (error) {
    console.error('示例1失败:', error);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * 示例2: 使用组合操作进行链接提取
 */
async function exampleCompositeLinkExtraction() {
  console.log('🔗 组合操作链接提取示例...');
  
  let browser;
  let page;
  
  try {
    // 启动浏览器
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    page = await context.newPage();
    
    // 创建组合操作工厂
    const compositeFactory = new CompositeOperationFactory();
    
    // 创建链接提取系统
    const linkSystem = compositeFactory.createLinkExtractionSystem({
      linkSelector: 'a[href]',
      allowedTypes: ['general', 'post', 'user'],
      validOnly: true,
      maxLinks: 20
    });
    
    // 导航到测试页面
    await page.goto('https://news.ycombinator.com', { waitUntil: 'networkidle' });
    
    // 执行组合操作
    console.log('执行链接提取...');
    const result = await linkSystem.composite.execute(page);
    
    console.log('提取结果:', {
      success: result.success,
      count: result.count,
      links: result.links.slice(0, 3) // 只显示前3个
    });
    
  } catch (error) {
    console.error('示例2失败:', error);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * 示例3: 嵌套操作 - 提取评论并获取作者信息
 */
async function exampleNestedOperations() {
  console.log('🔍 嵌套操作示例...');
  
  let browser;
  let page;
  
  try {
    // 启动浏览器
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    page = await context.newPage();
    
    // 创建原子操作工厂
    const atomicFactory = new AtomicOperationFactory();
    
    // 创建评论提取操作
    const commentExtraction = {
      // 1. 查找评论容器
      findComments: atomicFactory.createOperation('element.exists', {
        selector: '.comment, .comment-item',
        options: { timeout: 5000 }
      }),
      
      // 2. 提取评论内容
      extractCommentTexts: atomicFactory.createOperation('element.text', {
        selector: '.comment-text, .comment-content',
        options: { multiple: true, timeout: 5000 }
      }),
      
      // 3. 提取评论作者
      extractCommentAuthors: atomicFactory.createOperation('element.text', {
        selector: '.comment-author, .username',
        options: { multiple: true, timeout: 5000 }
      }),
      
      // 4. 提取评论时间
      extractCommentTimes: atomicFactory.createOperation('element.text', {
        selector: '.comment-time, .time',
        options: { multiple: true, timeout: 5000 }
      })
    };
    
    // 导航到有评论的页面
    await page.goto('https://news.ycombinator.com/news', { waitUntil: 'networkidle' });
    
    // 执行嵌套操作
    console.log('查找评论容器...');
    const commentsExist = await commentExtraction.findComments.execute(page);
    
    if (commentsExist.exists) {
      console.log('提取评论内容...');
      const commentTexts = await commentExtraction.extractCommentTexts.execute(page);
      
      console.log('提取评论作者...');
      const commentAuthors = await commentExtraction.extractCommentAuthors.execute(page);
      
      console.log('提取评论时间...');
      const commentTimes = await commentExtraction.extractCommentTimes.execute(page);
      
      // 组合评论数据
      const comments = [];
      const texts = commentTexts.texts || [];
      const authors = commentAuthors.texts || [];
      const times = commentTimes.texts || [];
      
      const maxComments = Math.min(texts.length, authors.length, times.length);
      
      for (let i = 0; i < maxComments; i++) {
        comments.push({
          id: i + 1,
          text: texts[i],
          author: authors[i],
          time: times[i]
        });
      }
      
      console.log('提取的评论:', comments.slice(0, 3)); // 只显示前3个
    } else {
      console.log('未找到评论');
    }
    
  } catch (error) {
    console.error('示例3失败:', error);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * 示例4: 自定义组合操作 - 产品信息提取
 */
async function exampleCustomCompositeOperation() {
  console.log('🛒 自定义组合操作示例...');
  
  let browser;
  let page;
  
  try {
    // 启动浏览器
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    page = await context.newPage();
    
    // 创建自定义产品信息提取组合操作
    class ProductInfoExtractionOperation {
      constructor(config = {}) {
        this.config = config;
        this.atomicFactory = new AtomicOperationFactory();
        this.operations = {};
        this.extractedProducts = [];
      }
      
      buildOperations() {
        this.operations.checkProductContainer = this.atomicFactory.createOperation('element.exists', {
          selector: this.config.containerSelector || '.product, .product-item',
          options: { timeout: 5000 }
        });
        
        this.operations.extractProductNames = this.atomicFactory.createOperation('element.text', {
          selector: this.config.nameSelector || '.product-name, .title',
          options: { multiple: true, timeout: 5000 }
        });
        
        this.operations.extractProductPrices = this.atomicFactory.createOperation('element.text', {
          selector: this.config.priceSelector || '.price, .cost',
          options: { multiple: true, timeout: 5000 }
        });
        
        this.operations.extractProductLinks = this.atomicFactory.createOperation('element.attribute', {
          selector: this.config.linkSelector || '.product-link, a',
          attribute: 'href',
          options: { multiple: true, timeout: 5000 }
        });
        
        return this.operations;
      }
      
      async execute(context, options = {}) {
        const results = [];
        
        try {
          const containerResult = await this.operations.checkProductContainer.execute(context);
          results.push(containerResult);
          
          if (!containerResult.exists) {
            return {
              success: false,
              error: 'Product container not found',
              results: results
            };
          }
          
          const namesResult = await this.operations.extractProductNames.execute(context);
          const pricesResult = await this.operations.extractProductPrices.execute(context);
          const linksResult = await this.operations.extractProductLinks.execute(context);
          
          results.push(namesResult, pricesResult, linksResult);
          
          // 组合产品信息
          const products = [];
          const names = namesResult.texts || [];
          const prices = pricesResult.texts || [];
          const links = linksResult.attributes || [];
          
          const maxProducts = Math.min(names.length, prices.length, links.length);
          
          for (let i = 0; i < maxProducts; i++) {
            products.push({
              name: names[i],
              price: prices[i],
              link: links[i]
            });
          }
          
          this.extractedProducts.push(...products);
          
          return {
            success: true,
            products: products,
            count: products.length,
            results: results
          };
          
        } catch (error) {
          return {
            success: false,
            error: error.message,
            results: results
          };
        }
      }
      
      getExtractedData() {
        return {
          products: this.extractedProducts,
          total: this.extractedProducts.length
        };
      }
      
      reset() {
        this.extractedProducts = [];
        for (const operation of Object.values(this.operations)) {
          if (operation.reset) {
            operation.reset();
          }
        }
      }
    }
    
    // 使用自定义组合操作
    const productExtraction = new ProductInfoExtractionOperation({
      containerSelector: '.product',
      nameSelector: '.product-name',
      priceSelector: '.price',
      linkSelector: '.product-link'
    });
    
    productExtraction.buildOperations();
    
    // 导航到电商网站（示例）
    await page.goto('https://www.amazon.com', { waitUntil: 'networkidle' });
    
    // 执行产品信息提取
    console.log('提取产品信息...');
    const result = await productExtraction.execute(page);
    
    console.log('提取结果:', {
      success: result.success,
      count: result.count,
      products: result.products.slice(0, 3) // 只显示前3个
    });
    
  } catch (error) {
    console.error('示例4失败:', error);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

/**
 * 主函数 - 运行所有示例
 */
async function runAllExamples() {
  console.log('🚀 开始原子化操作示例...\n');
  
  try {
    await exampleAtomicLinkExtraction();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await exampleCompositeLinkExtraction();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await exampleNestedOperations();
    console.log('\n' + '='.repeat(50) + '\n');
    
    await exampleCustomCompositeOperation();
    
    console.log('\n✅ 所有示例完成!');
    
  } catch (error) {
    console.error('示例运行失败:', error);
  }
}

// 如果直接运行此文件，则执行示例
if (require.main === module) {
  runAllExamples()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('示例执行失败:', error);
      process.exit(1);
    });
}

module.exports = {
  exampleAtomicLinkExtraction,
  exampleCompositeLinkExtraction,
  exampleNestedOperations,
  exampleCustomCompositeOperation,
  runAllExamples
};