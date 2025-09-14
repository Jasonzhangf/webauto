/**
 * 高级组合操作示例
 * 使用原子操作构建复杂的业务逻辑
 */

const {
  NestedOperationManager,
  AbstractContainer
} = require('./nested-operations-framework');

const {
  AtomicOperationFactory
} = require('./atomic-operations');

// === 组合操作构建器 ===

/**
 * 链接提取组合操作
 */
class LinkExtractionCompositeOperation {
  constructor(config = {}) {
    this.config = config;
    this.atomicFactory = new AtomicOperationFactory();
    this.operations = {};
    this.extractedLinks = [];
  }

  /**
   * 构建链接提取操作序列
   */
  buildOperations() {
    // 1. 查找所有链接元素
    this.operations.findLinks = this.atomicFactory.createOperation('element.exists', {
      selector: this.config.linkSelector || 'a[href]',
      options: { timeout: 5000 }
    });

    // 2. 提取链接href属性
    this.operations.extractHrefs = this.atomicFactory.createOperation('element.attribute', {
      selector: this.config.linkSelector || 'a[href]',
      attribute: 'href',
      options: { multiple: true, timeout: 5000 }
    });

    // 3. 提取链接文本
    this.operations.extractLinkTexts = this.atomicFactory.createOperation('element.text', {
      selector: this.config.linkSelector || 'a[href]',
      options: { multiple: true, timeout: 5000 }
    });

    // 4. 提取链接标题属性
    this.operations.extractTitles = this.atomicFactory.createOperation('element.attribute', {
      selector: this.config.linkSelector || 'a[href]',
      attribute: 'title',
      options: { multiple: true, timeout: 5000 }
    });

    return this.operations;
  }

  /**
   * 执行链接提取
   */
  async execute(context, options = {}) {
    const results = [];
    
    try {
      // 检查链接是否存在
      const existsResult = await this.operations.findLinks.execute(context);
      results.push(existsResult);
      
      if (!existsResult.exists) {
        return {
          success: true,
          links: [],
          message: 'No links found',
          results: results
        };
      }

      // 提取链接数据
      const hrefsResult = await this.operations.extractHrefs.execute(context);
      const textsResult = await this.operations.extractLinkTexts.execute(context);
      const titlesResult = await this.operations.extractTitles.execute(context);
      
      results.push(hrefsResult, textsResult, titlesResult);

      // 组合链接数据
      const links = this.combineLinkData(hrefsResult, textsResult, titlesResult);
      this.extractedLinks.push(...links);

      return {
        success: true,
        links: links,
        count: links.length,
        results: results
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        links: [],
        results: results
      };
    }
  }

  /**
   * 组合链接数据
   */
  combineLinkData(hrefsResult, textsResult, titlesResult) {
    const links = [];
    const hrefs = hrefsResult.attributes || [];
    const texts = textsResult.texts || [];
    const titles = titlesResult.attributes || [];

    // 确保数组长度一致
    const maxLength = Math.max(hrefs.length, texts.length, titles.length);
    
    for (let i = 0; i < maxLength; i++) {
      const href = hrefs[i] || '';
      const text = texts[i] || '';
      const title = titles[i] || '';

      // 跳过无效链接
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        continue;
      }

      // 检测链接类型
      const linkType = this.detectLinkType(href);
      
      links.push({
        href: href,
        text: text,
        title: title,
        type: linkType,
        isValid: this.isValidUrl(href),
        isInternal: this.isInternalUrl(href),
        domain: this.extractDomain(href)
      });
    }

    return this.filterLinks(links);
  }

  /**
   * 检测链接类型
   */
  detectLinkType(href) {
    if (href.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i)) {
      return 'image';
    } else if (href.match(/\.(mp4|avi|mov|wmv|flv|webm)$/i)) {
      return 'video';
    } else if (href.match(/\.(mp3|wav|ogg|aac|flac)$/i)) {
      return 'audio';
    } else if (href.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/i)) {
      return 'document';
    } else if (href.match(/\.(zip|rar|7z|tar|gz)$/i)) {
      return 'archive';
    } else if (href.includes('/status/') || href.includes('/post/') || href.includes('/article/')) {
      return 'post';
    } else if (href.includes('/user/') || href.includes('/u/') || href.includes('/profile/')) {
      return 'user';
    } else if (href.includes('/search/') || href.includes('/s/')) {
      return 'search';
    } else if (href.includes('/tag/') || href.includes('/category/') || href.includes('/topic/')) {
      return 'tag';
    } else {
      return 'general';
    }
  }

  /**
   * 验证URL
   */
  isValidUrl(href) {
    try {
      new URL(href);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查是否为内部链接
   */
  isInternalUrl(href) {
    try {
      const url = new URL(href);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  /**
   * 提取域名
   */
  extractDomain(href) {
    try {
      const url = new URL(href);
      return url.hostname;
    } catch {
      return '';
    }
  }

  /**
   * 过滤链接
   */
  filterLinks(links) {
    const config = this.config;
    let filtered = links;

    // 按类型过滤
    if (config.allowedTypes && config.allowedTypes.length > 0) {
      filtered = filtered.filter(link => config.allowedTypes.includes(link.type));
    }

    // 排除特定类型
    if (config.excludedTypes && config.excludedTypes.length > 0) {
      filtered = filtered.filter(link => !config.excludedTypes.includes(link.type));
    }

    // 只包含有效链接
    if (config.validOnly) {
      filtered = filtered.filter(link => link.isValid);
    }

    // 只包含内部链接
    if (config.internalOnly) {
      filtered = filtered.filter(link => link.isInternal);
    }

    // 限制数量
    if (config.maxLinks && filtered.length > config.maxLinks) {
      filtered = filtered.slice(0, config.maxLinks);
    }

    return filtered;
  }

  getExtractedData() {
    return {
      links: this.extractedLinks,
      total: this.extractedLinks.length,
      config: this.config
    };
  }

  reset() {
    this.extractedLinks = [];
    for (const operation of Object.values(this.operations)) {
      if (operation.reset) {
        operation.reset();
      }
    }
  }
}

/**
 * 表单提交组合操作
 */
class FormSubmissionCompositeOperation {
  constructor(config = {}) {
    this.config = config;
    this.atomicFactory = new AtomicOperationFactory();
    this.operations = {};
  }

  /**
   * 构建表单提交操作序列
   */
  buildOperations() {
    // 1. 检查表单是否存在
    this.operations.checkForm = this.atomicFactory.createOperation('element.exists', {
      selector: this.config.formSelector || 'form',
      options: { timeout: 5000 }
    });

    // 2. 填写表单字段
    if (this.config.fields) {
      this.operations.fillFields = {};
      for (const [fieldName, fieldConfig] of Object.entries(this.config.fields)) {
        this.operations.fillFields[fieldName] = this.atomicFactory.createOperation('element.input', {
          selector: fieldConfig.selector,
          text: fieldConfig.value,
          options: fieldConfig.options || { delay: 100 }
        });
      }
    }

    // 3. 检查提交按钮
    this.operations.checkSubmitButton = this.atomicFactory.createOperation('element.exists', {
      selector: this.config.submitSelector || 'button[type="submit"], input[type="submit"]',
      options: { timeout: 5000 }
    });

    // 4. 点击提交按钮
    this.operations.clickSubmit = this.atomicFactory.createOperation('element.click', {
      selector: this.config.submitSelector || 'button[type="submit"], input[type="submit"]',
      options: { timeout: 5000 }
    });

    return this.operations;
  }

  /**
   * 执行表单提交
   */
  async execute(context, options = {}) {
    const results = [];
    
    try {
      // 检查表单是否存在
      const formResult = await this.operations.checkForm.execute(context);
      results.push(formResult);
      
      if (!formResult.exists) {
        return {
          success: false,
          error: 'Form not found',
          results: results
        };
      }

      // 填写表单字段
      if (this.operations.fillFields) {
        for (const [fieldName, operation] of Object.entries(this.operations.fillFields)) {
          const fieldResult = await operation.execute(context);
          results.push({ field: fieldName, ...fieldResult });
        }
      }

      // 检查提交按钮
      const submitButtonResult = await this.operations.checkSubmitButton.execute(context);
      results.push(submitButtonResult);
      
      if (!submitButtonResult.exists) {
        return {
          success: false,
          error: 'Submit button not found',
          results: results
        };
      }

      // 点击提交按钮
      const submitResult = await this.operations.clickSubmit.execute(context);
      results.push(submitResult);

      return {
        success: submitResult.success,
        message: 'Form submitted successfully',
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
}

/**
 * 内容提取组合操作
 */
class ContentExtractionCompositeOperation {
  constructor(config = {}) {
    this.config = config;
    this.atomicFactory = new AtomicOperationFactory();
    this.operations = {};
    this.extractedContent = [];
  }

  /**
   * 构建内容提取操作序列
   */
  buildOperations() {
    // 1. 检查内容容器
    this.operations.checkContainer = this.atomicFactory.createOperation('element.exists', {
      selector: this.config.containerSelector || '.content',
      options: { timeout: 5000 }
    });

    // 2. 提取标题
    this.operations.extractTitle = this.atomicFactory.createOperation('element.text', {
      selector: this.config.titleSelector || 'h1, .title',
      options: { timeout: 5000 }
    });

    // 3. 提取主要内容
    this.operations.extractContent = this.atomicFactory.createOperation('element.text', {
      selector: this.config.contentSelector || '.content, .article-content',
      options: { timeout: 5000 }
    });

    // 4. 提取作者信息
    this.operations.extractAuthor = this.atomicFactory.createOperation('element.text', {
      selector: this.config.authorSelector || '.author, .byline',
      options: { timeout: 5000 }
    });

    // 5. 提取日期信息
    this.operations.extractDate = this.atomicFactory.createOperation('element.text', {
      selector: this.config.dateSelector || '.date, .time, .published',
      options: { timeout: 5000 }
    });

    // 6. 提取标签
    this.operations.extractTags = this.atomicFactory.createOperation('element.text', {
      selector: this.config.tagsSelector || '.tags, .categories',
      options: { multiple: true, timeout: 5000 }
    });

    return this.operations;
  }

  /**
   * 执行内容提取
   */
  async execute(context, options = {}) {
    const results = [];
    
    try {
      // 检查内容容器
      const containerResult = await this.operations.checkContainer.execute(context);
      results.push(containerResult);
      
      if (!containerResult.exists) {
        return {
          success: false,
          error: 'Content container not found',
          results: results
        };
      }

      // 提取各个字段
      const titleResult = await this.operations.extractTitle.execute(context);
      const contentResult = await this.operations.extractContent.execute(context);
      const authorResult = await this.operations.extractAuthor.execute(context);
      const dateResult = await this.operations.extractDate.execute(context);
      const tagsResult = await this.operations.extractTags.execute(context);
      
      results.push(titleResult, contentResult, authorResult, dateResult, tagsResult);

      // 组合内容数据
      const content = {
        title: titleResult.text || '',
        content: contentResult.text || '',
        author: authorResult.text || '',
        date: dateResult.text || '',
        tags: tagsResult.texts || [],
        url: context.url(),
        extractedAt: new Date().toISOString()
      };

      this.extractedContent.push(content);

      return {
        success: true,
        content: content,
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
      content: this.extractedContent,
      total: this.extractedContent.length
    };
  }

  reset() {
    this.extractedContent = [];
    for (const operation of Object.values(this.operations)) {
      if (operation.reset) {
        operation.reset();
      }
    }
  }
}

// === 组合操作工厂 ===

/**
 * 组合操作工厂
 */
class CompositeOperationFactory {
  constructor() {
    this.atomicFactory = new AtomicOperationFactory();
  }

  /**
   * 创建链接提取系统
   */
  createLinkExtractionSystem(config = {}) {
    const system = {
      composite: new LinkExtractionCompositeOperation(config),
      operations: {}
    };

    // 构建原子操作
    system.operations = system.composite.buildOperations();

    return system;
  }

  /**
   * 创建表单提交系统
   */
  createFormSubmissionSystem(config = {}) {
    const system = {
      composite: new FormSubmissionCompositeOperation(config),
      operations: {}
    };

    // 构建原子操作
    system.operations = system.composite.buildOperations();

    return system;
  }

  /**
   * 创建内容提取系统
   */
  createContentExtractionSystem(config = {}) {
    const system = {
      composite: new ContentExtractionCompositeOperation(config),
      operations: {}
    };

    // 构建原子操作
    system.operations = system.composite.buildOperations();

    return system;
  }

  /**
   * 创建自定义组合系统
   */
  createCustomSystem(operationConfigs, customCompositeClass) {
    const system = {
      composite: new customCompositeClass(operationConfigs),
      operations: {}
    };

    // 构建原子操作
    system.operations = system.composite.buildOperations();

    return system;
  }
}

module.exports = {
  // 组合操作类
  LinkExtractionCompositeOperation,
  FormSubmissionCompositeOperation,
  ContentExtractionCompositeOperation,
  
  // 工厂类
  CompositeOperationFactory
};