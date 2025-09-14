/**
 * 原子化操作子库
 * 基于selector的完全通用操作，每个操作都是自包含的原子操作
 */

// === 基础元素操作 ===

/**
 * 元素存在检查操作
 */
class ElementExistsOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 5000;
  }

  async execute(page) {
    try {
      const element = await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'attached' 
      });
      return { success: true, result: element !== null };
    } catch (error) {
      return { success: true, result: false };
    }
  }
}

/**
 * 元素点击操作
 */
class ElementClickOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 10000;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'visible' 
      });
      await page.click(this.selector);
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素输入操作
 */
class ElementInputOperation {
  constructor(config) {
    this.selector = config.selector;
    this.value = config.value;
    this.timeout = config.timeout || 10000;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'visible' 
      });
      await page.fill(this.selector, this.value);
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素文本提取操作
 */
class ElementTextOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 5000;
    this.multiple = config.multiple || false;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'attached' 
      });
      
      if (this.multiple) {
        const elements = await page.$$(this.selector);
        const texts = await Promise.all(
          elements.map(el => el.textContent())
        );
        return { success: true, result: texts.filter(text => text && text.trim()) };
      } else {
        const text = await page.textContent(this.selector);
        return { success: true, result: text ? text.trim() : '' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素属性提取操作
 */
class ElementAttributeOperation {
  constructor(config) {
    this.selector = config.selector;
    this.attribute = config.attribute;
    this.timeout = config.timeout || 5000;
    this.multiple = config.multiple || false;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'attached' 
      });
      
      if (this.multiple) {
        const elements = await page.$$(this.selector);
        const attributes = await Promise.all(
          elements.map(el => el.getAttribute(this.attribute))
        );
        return { success: true, result: attributes.filter(attr => attr) };
      } else {
        const attr = await page.getAttribute(this.selector, this.attribute);
        return { success: true, result: attr || '' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 元素可见性检查操作
 */
class ElementVisibleOperation {
  constructor(config) {
    this.selector = config.selector;
    this.timeout = config.timeout || 5000;
  }

  async execute(page) {
    try {
      await page.waitForSelector(this.selector, { 
        timeout: this.timeout,
        state: 'visible' 
      });
      return { success: true, result: true };
    } catch (error) {
      return { success: true, result: false };
    }
  }
}

// === 操作工厂 ===

class AtomicOperationFactory {
  static createOperation(type, config) {
    switch (type) {
      case 'element.exists':
        return new ElementExistsOperation(config);
      case 'element.click':
        return new ElementClickOperation(config);
      case 'element.input':
        return new ElementInputOperation(config);
      case 'element.text':
        return new ElementTextOperation(config);
      case 'element.attribute':
        return new ElementAttributeOperation(config);
      case 'element.visible':
        return new ElementVisibleOperation(config);
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }
}

module.exports = {
  // 操作类
  ElementExistsOperation,
  ElementClickOperation,
  ElementInputOperation,
  ElementTextOperation,
  ElementAttributeOperation,
  ElementVisibleOperation,
  
  // 工厂类
  AtomicOperationFactory
};