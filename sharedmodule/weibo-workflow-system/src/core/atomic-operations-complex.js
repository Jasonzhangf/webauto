/**
 * 原子化操作子库
 * 基于selector的完全通用操作，每个操作都是自包含的原子操作
 */

// 简化的原子操作实现，不依赖复杂的框架

// === 基础元素操作 ===

/**
 * 元素存在检查操作
 */
class ElementExistsOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.options = config.options || { timeout: 5000 };
  }

  async canExecute(context) {
    return { allowed: true, reason: 'always executable' };
  }

  async doExecute(context, options = {}) {
    try {
      const element = await context.$(this.selector, { timeout: this.options.timeout });
      const exists = !!element;
      
      return {
        success: true,
        exists: exists,
        selector: this.selector,
        metadata: {
          timeout: this.options.timeout,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        exists: false,
        error: error.message,
        selector: this.selector
      };
    }
  }
}

/**
 * 元素点击操作
 */
class ElementClickOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.options = config.options || { force: false, timeout: 5000 };
  }

  async canExecute(context) {
    try {
      const element = await context.$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: !!element,
        reason: element ? 'element found' : 'element not found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      await context.click(this.selector, this.options);
      
      return {
        success: true,
        action: 'click',
        selector: this.selector,
        metadata: {
          options: this.options,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        action: 'click',
        error: error.message,
        selector: this.selector
      };
    }
  }
}

/**
 * 元素输入操作
 */
class ElementInputOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.text = config.text;
    this.options = config.options || { delay: 100, timeout: 5000 };
  }

  async canExecute(context) {
    try {
      const element = await context.$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: !!element,
        reason: element ? 'element found' : 'element not found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      await context.fill(this.selector, this.text, this.options);
      
      return {
        success: true,
        action: 'input',
        selector: this.selector,
        text: this.text,
        metadata: {
          options: this.options,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        action: 'input',
        error: error.message,
        selector: this.selector
      };
    }
  }
}

// === 数据提取操作 ===

/**
 * 元素文本提取操作
 */
class ElementTextOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.options = config.options || { multiple: false, timeout: 5000 };
    this.extractedData = [];
  }

  async canExecute(context) {
    try {
      const elements = await context.$$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: elements.length > 0,
        reason: elements.length > 0 ? 'elements found' : 'no elements found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      if (this.options.multiple) {
        const texts = await context.$$eval(this.selector, elements => 
          elements.map(el => el.textContent?.trim() || '')
        );
        this.extractedData.push(...texts);
        
        return {
          success: true,
          action: 'extract-text-multiple',
          selector: this.selector,
          texts: texts,
          metadata: {
            count: texts.length,
            options: this.options,
            executionTime: Date.now()
          }
        };
      } else {
        const text = await context.$eval(this.selector, el => 
          el.textContent?.trim() || ''
        );
        this.extractedData.push(text);
        
        return {
          success: true,
          action: 'extract-text',
          selector: this.selector,
          text: text,
          metadata: {
            options: this.options,
            executionTime: Date.now()
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        action: 'extract-text',
        error: error.message,
        selector: this.selector
      };
    }
  }

  getExtractedData() {
    return {
      texts: this.extractedData,
      total: this.extractedData.length
    };
  }

  reset() {
    super.reset();
    this.extractedData = [];
  }
}

/**
 * 元素属性提取操作
 */
class ElementAttributeOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.attribute = config.attribute;
    this.options = config.options || { multiple: false, timeout: 5000 };
    this.extractedData = [];
  }

  async canExecute(context) {
    try {
      const elements = await context.$$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: elements.length > 0,
        reason: elements.length > 0 ? 'elements found' : 'no elements found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      if (this.options.multiple) {
        const attributes = await context.$$eval(this.selector, elements => 
          elements.map(el => el.getAttribute(this.attribute) || '')
        );
        this.extractedData.push(...attributes);
        
        return {
          success: true,
          action: 'extract-attribute-multiple',
          selector: this.selector,
          attribute: this.attribute,
          attributes: attributes,
          metadata: {
            count: attributes.length,
            options: this.options,
            executionTime: Date.now()
          }
        };
      } else {
        const attribute = await context.$eval(this.selector, el => 
          el.getAttribute(this.attribute) || ''
        );
        this.extractedData.push(attribute);
        
        return {
          success: true,
          action: 'extract-attribute',
          selector: this.selector,
          attribute: this.attribute,
          value: attribute,
          metadata: {
            options: this.options,
            executionTime: Date.now()
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        action: 'extract-attribute',
        error: error.message,
        selector: this.selector
      };
    }
  }

  getExtractedData() {
    return {
      attributes: this.extractedData,
      total: this.extractedData.length
    };
  }

  reset() {
    super.reset();
    this.extractedData = [];
  }
}

/**
 * 元素HTML提取操作
 */
class ElementHtmlOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.options = config.options || { outer: false, multiple: false, timeout: 5000 };
    this.extractedData = [];
  }

  async canExecute(context) {
    try {
      const elements = await context.$$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: elements.length > 0,
        reason: elements.length > 0 ? 'elements found' : 'no elements found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      if (this.options.multiple) {
        const htmlElements = await context.$$eval(this.selector, elements => 
          elements.map(el => this.options.outer ? el.outerHTML : el.innerHTML)
        );
        this.extractedData.push(...htmlElements);
        
        return {
          success: true,
          action: 'extract-html-multiple',
          selector: this.selector,
          htmlElements: htmlElements,
          metadata: {
            count: htmlElements.length,
            options: this.options,
            executionTime: Date.now()
          }
        };
      } else {
        const html = await context.$eval(this.selector, el => 
          this.options.outer ? el.outerHTML : el.innerHTML
        );
        this.extractedData.push(html);
        
        return {
          success: true,
          action: 'extract-html',
          selector: this.selector,
          html: html,
          metadata: {
            options: this.options,
            executionTime: Date.now()
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        action: 'extract-html',
        error: error.message,
        selector: this.selector
      };
    }
  }

  getExtractedData() {
    return {
      htmlElements: this.extractedData,
      total: this.extractedData.length
    };
  }

  reset() {
    super.reset();
    this.extractedData = [];
  }
}

// === 结构操作 ===

/**
 * 子元素查找操作
 */
class ElementChildrenOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.childSelector = config.childSelector;
    this.options = config.options || { maxDepth: 1, timeout: 5000 };
    this.extractedData = [];
  }

  async canExecute(context) {
    try {
      const elements = await context.$$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: elements.length > 0,
        reason: elements.length > 0 ? 'parent elements found' : 'no parent elements found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      const children = await this.findChildren(context);
      this.extractedData.push(...children);
      
      return {
        success: true,
        action: 'find-children',
        selector: this.selector,
        childSelector: this.childSelector,
        children: children,
        metadata: {
          count: children.length,
          maxDepth: this.options.maxDepth,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        action: 'find-children',
        error: error.message,
        selector: this.selector
      };
    }
  }

  async findChildren(context, depth = 0) {
    if (depth >= this.options.maxDepth) {
      return [];
    }

    const children = await context.$$eval(this.selector, (parentSelector, childSelector) => {
      const parents = document.querySelectorAll(parentSelector);
      const results = [];
      
      parents.forEach(parent => {
        const children = parent.querySelectorAll(childSelector);
        children.forEach(child => {
          results.push({
            element: child.outerHTML,
            depth: depth + 1,
            parentTag: parent.tagName,
            childTag: child.tagName,
            childText: child.textContent?.trim() || ''
          });
        });
      });
      
      return results;
    }, this.selector, this.childSelector);

    // 递归查找更深层的子元素
    if (depth + 1 < this.options.maxDepth) {
      const deeperChildren = await this.findChildren(context, depth + 1);
      children.push(...deeperChildren);
    }

    return children;
  }

  getExtractedData() {
    return {
      children: this.extractedData,
      total: this.extractedData.length
    };
  }

  reset() {
    super.reset();
    this.extractedData = [];
  }
}

/**
 * 父元素查找操作
 */
class ElementParentsOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.parentSelector = config.parentSelector;
    this.options = config.options || { maxLevels: 3, timeout: 5000 };
    this.extractedData = [];
  }

  async canExecute(context) {
    try {
      const elements = await context.$$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: elements.length > 0,
        reason: elements.length > 0 ? 'child elements found' : 'no child elements found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      const parents = await this.findParents(context);
      this.extractedData.push(...parents);
      
      return {
        success: true,
        action: 'find-parents',
        selector: this.selector,
        parentSelector: this.parentSelector,
        parents: parents,
        metadata: {
          count: parents.length,
          maxLevels: this.options.maxLevels,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        action: 'find-parents',
        error: error.message,
        selector: this.selector
      };
    }
  }

  async findParents(context, level = 0) {
    if (level >= this.options.maxLevels) {
      return [];
    }

    const parents = await context.$$eval(this.selector, (childSelector, parentSelector) => {
      const children = document.querySelectorAll(childSelector);
      const results = [];
      
      children.forEach(child => {
        let parent = child.parentElement;
        let currentLevel = 0;
        
        while (parent && currentLevel < 3) {
          if (parentSelector && parent.matches(parentSelector)) {
            results.push({
              element: parent.outerHTML,
              level: currentLevel + 1,
              parentTag: parent.tagName,
              childTag: child.tagName,
              childText: child.textContent?.trim() || ''
            });
          }
          parent = parent.parentElement;
          currentLevel++;
        }
      });
      
      return results;
    }, this.selector, this.parentSelector);

    return parents;
  }

  getExtractedData() {
    return {
      parents: this.extractedData,
      total: this.extractedData.length
    };
  }

  reset() {
    super.reset();
    this.extractedData = [];
  }
}

/**
 * 兄弟元素查找操作
 */
class ElementSiblingsOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.siblingSelector = config.siblingSelector;
    this.options = config.options || { timeout: 5000 };
    this.extractedData = [];
  }

  async canExecute(context) {
    try {
      const elements = await context.$$(this.selector, { timeout: this.options.timeout });
      return {
        allowed: elements.length > 0,
        reason: elements.length > 0 ? 'reference elements found' : 'no reference elements found'
      };
    } catch (error) {
      return { allowed: false, reason: error.message };
    }
  }

  async doExecute(context, options = {}) {
    try {
      const siblings = await this.findSiblings(context);
      this.extractedData.push(...siblings);
      
      return {
        success: true,
        action: 'find-siblings',
        selector: this.selector,
        siblingSelector: this.siblingSelector,
        siblings: siblings,
        metadata: {
          count: siblings.length,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        action: 'find-siblings',
        error: error.message,
        selector: this.selector
      };
    }
  }

  async findSiblings(context) {
    return await context.$$eval(this.selector, (selector, siblingSelector) => {
      const elements = document.querySelectorAll(selector);
      const results = [];
      
      elements.forEach(element => {
        const parent = element.parentElement;
        if (!parent) return;
        
        const siblings = Array.from(parent.children).filter(child => {
          if (siblingSelector) {
            return child !== element && child.matches(siblingSelector);
          }
          return child !== element;
        });
        
        siblings.forEach(sibling => {
          results.push({
            element: sibling.outerHTML,
            elementTag: sibling.tagName,
            elementText: sibling.textContent?.trim() || '',
            referenceTag: element.tagName,
            referenceText: element.textContent?.trim() || ''
          });
        });
      });
      
      return results;
    }, this.selector, this.siblingSelector);
  }

  getExtractedData() {
    return {
      siblings: this.extractedData,
      total: this.extractedData.length
    };
  }

  reset() {
    super.reset();
    this.extractedData = [];
  }
}

// === 状态检查操作 ===

/**
 * 元素可见性检查操作
 */
class ElementVisibleOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.options = config.options || { timeout: 5000 };
  }

  async canExecute(context) {
    return { allowed: true, reason: 'always executable' };
  }

  async doExecute(context, options = {}) {
    try {
      const element = await context.$(this.selector, { timeout: this.options.timeout });
      if (!element) {
        return {
          success: true,
          visible: false,
          selector: this.selector,
          reason: 'element not found'
        };
      }
      
      const isVisible = await element.isVisible();
      
      return {
        success: true,
        visible: isVisible,
        selector: this.selector,
        metadata: {
          timeout: this.options.timeout,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        visible: false,
        error: error.message,
        selector: this.selector
      };
    }
  }
}

/**
 * 元素启用状态检查操作
 */
class ElementEnabledOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.options = config.options || { timeout: 5000 };
  }

  async canExecute(context) {
    return { allowed: true, reason: 'always executable' };
  }

  async doExecute(context, options = {}) {
    try {
      const element = await context.$(this.selector, { timeout: this.options.timeout });
      if (!element) {
        return {
          success: true,
          enabled: false,
          selector: this.selector,
          reason: 'element not found'
        };
      }
      
      const isEnabled = await element.isEnabled();
      
      return {
        success: true,
        enabled: isEnabled,
        selector: this.selector,
        metadata: {
          timeout: this.options.timeout,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        enabled: false,
        error: error.message,
        selector: this.selector
      };
    }
  }
}

/**
 * 元素包含文本检查操作
 */
class ElementContainsOperation extends AbstractOperation {
  constructor(config = {}) {
    super(config);
    this.selector = config.selector;
    this.text = config.text;
    this.options = config.options || { partial: true, caseSensitive: false, timeout: 5000 };
  }

  async canExecute(context) {
    return { allowed: true, reason: 'always executable' };
  }

  async doExecute(context, options = {}) {
    try {
      const element = await context.$(this.selector, { timeout: this.options.timeout });
      if (!element) {
        return {
          success: true,
          contains: false,
          selector: this.selector,
          reason: 'element not found'
        };
      }
      
      const elementText = await element.textContent();
      let contains = false;
      
      if (this.options.caseSensitive) {
        contains = this.options.partial 
          ? elementText.includes(this.text)
          : elementText === this.text;
      } else {
        const lowerElementText = elementText.toLowerCase();
        const lowerSearchText = this.text.toLowerCase();
        contains = this.options.partial 
          ? lowerElementText.includes(lowerSearchText)
          : lowerElementText === lowerSearchText;
      }
      
      return {
        success: true,
        contains: contains,
        selector: this.selector,
        searchText: this.text,
        elementText: elementText,
        metadata: {
          options: this.options,
          executionTime: Date.now()
        }
      };
    } catch (error) {
      return {
        success: false,
        contains: false,
        error: error.message,
        selector: this.selector
      };
    }
  }
}

// === 原子操作工厂 ===

/**
 * 原子操作工厂
 */
class AtomicOperationFactory {
  constructor() {
    this.operationTypes = new Map();
    this.registerDefaultOperations();
  }

  /**
   * 注册默认操作类型
   */
  registerDefaultOperations() {
    this.operationTypes.set('element.exists', ElementExistsOperation);
    this.operationTypes.set('element.click', ElementClickOperation);
    this.operationTypes.set('element.input', ElementInputOperation);
    this.operationTypes.set('element.text', ElementTextOperation);
    this.operationTypes.set('element.attribute', ElementAttributeOperation);
    this.operationTypes.set('element.html', ElementHtmlOperation);
    this.operationTypes.set('element.children', ElementChildrenOperation);
    this.operationTypes.set('element.parents', ElementParentsOperation);
    this.operationTypes.set('element.siblings', ElementSiblingsOperation);
    this.operationTypes.set('element.visible', ElementVisibleOperation);
    this.operationTypes.set('element.enabled', ElementEnabledOperation);
    this.operationTypes.set('element.contains', ElementContainsOperation);
  }

  /**
   * 注册自定义操作类型
   */
  registerOperationType(type, operationClass) {
    this.operationTypes.set(type, operationClass);
  }

  /**
   * 创建原子操作
   */
  createOperation(type, config) {
    const OperationClass = this.operationTypes.get(type);
    if (!OperationClass) {
      throw new Error(`Operation type ${type} not registered`);
    }
    return new OperationClass(config);
  }

  /**
   * 批量创建操作
   */
  createOperations(operationsConfig) {
    const operations = {};
    
    for (const [name, config] of Object.entries(operationsConfig)) {
      operations[name] = this.createOperation(config.type, config);
    }
    
    return operations;
  }

  /**
   * 获取可用的操作类型
   */
  getAvailableOperationTypes() {
    return Array.from(this.operationTypes.keys());
  }
}

module.exports = {
  // 基础元素操作
  ElementExistsOperation,
  ElementClickOperation,
  ElementInputOperation,
  
  // 数据提取操作
  ElementTextOperation,
  ElementAttributeOperation,
  ElementHtmlOperation,
  
  // 结构操作
  ElementChildrenOperation,
  ElementParentsOperation,
  ElementSiblingsOperation,
  
  // 状态检查操作
  ElementVisibleOperation,
  ElementEnabledOperation,
  ElementContainsOperation,
  
  // 工厂类
  AtomicOperationFactory
};