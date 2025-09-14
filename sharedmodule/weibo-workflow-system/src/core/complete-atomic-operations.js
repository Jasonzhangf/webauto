/**
 * 完整的原子化操作子库
 * 包含基础元素操作、页面操作、Cookie操作、系统操作等
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

// === 页面操作 ===

/**
 * 页面导航操作
 */
class PageNavigationOperation {
  constructor(config) {
    this.url = config.url;
    this.waitUntil = config.waitUntil || 'domcontentloaded';
    this.timeout = config.timeout || 30000;
  }

  async execute(page) {
    try {
      await page.goto(this.url, { 
        waitUntil: this.waitUntil,
        timeout: this.timeout 
      });
      return { success: true, result: this.url };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 页面等待操作
 */
class PageWaitOperation {
  constructor(config) {
    this.duration = config.duration || 1000;
    this.selector = config.selector;
    this.state = config.state || 'attached';
  }

  async execute(page) {
    try {
      if (this.selector) {
        await page.waitForSelector(this.selector, { 
          state: this.state,
          timeout: this.duration 
        });
      } else {
        await page.waitForTimeout(this.duration);
      }
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 页面滚动操作
 */
class PageScrollOperation {
  constructor(config) {
    this.direction = config.direction || 'bottom';
    this.amount = config.amount || 0;
  }

  async execute(page) {
    try {
      if (this.direction === 'bottom') {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
      } else if (this.direction === 'top') {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
      } else if (this.direction === 'amount') {
        await page.evaluate((amount) => {
          window.scrollBy(0, amount);
        }, this.amount);
      }
      return { success: true, result: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === Cookie虚拟操作子 ===

/**
 * Cookie加载虚拟操作子
 */
class CookieLoadOperation {
  constructor(config) {
    this.cookieSystem = config.cookieSystem;
    this.domain = config.domain || 'weibo.com';
    this.cookiePath = config.cookiePath;
  }

  async execute(page) {
    try {
      if (!this.cookieSystem) {
        throw new Error('Cookie system not provided');
      }

      // 如果提供了cookiePath，从文件加载
      if (this.cookiePath) {
        const fs = await import('fs');
        const cookieData = fs.readFileSync(this.cookiePath, 'utf8');
        const cookies = JSON.parse(cookieData);
        
        await this.cookieSystem.manager.storage.storeCookies(this.domain, cookies);
      }

      // 加载Cookie到页面
      await this.cookieSystem.loadCookies(page, this.domain);
      
      // 验证Cookie健康状态
      const health = await this.cookieSystem.validateCookieHealth(this.domain);
      
      return { 
        success: true, 
        result: { 
          domain: this.domain,
          health: health,
          loaded: true 
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * Cookie验证虚拟操作子
 */
class CookieValidateOperation {
  constructor(config) {
    this.cookieSystem = config.cookieSystem;
    this.domain = config.domain || 'weibo.com';
  }

  async execute(page) {
    try {
      if (!this.cookieSystem) {
        throw new Error('Cookie system not provided');
      }

      const health = await this.cookieSystem.validateCookieHealth(this.domain);
      
      return { 
        success: true, 
        result: { 
          domain: this.domain,
          health: health,
          isValid: health.isValid,
          isExpired: health.isExpired
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 登录状态检查虚拟操作子
 */
class LoginStatusCheckOperation {
  constructor(config) {
    this.selectors = config.selectors || [
      '.gn_name',
      '.S_txt1', 
      '.username',
      '[data-usercard*="true"]',
      'a[href*="/home"]',
      '.woo-box-flex.woo-box-alignCenter.Card_title_3NffA',
      '[class*="name"]',
      '.Profile_title_3y3yh'
    ];
  }

  async execute(page) {
    try {
      for (const selector of this.selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            if (text && text.trim().length > 0 && text.trim().length < 50) {
              return { 
                success: true, 
                result: { 
                  isLoggedIn: true,
                  username: text.trim(),
                  selector: selector
                } 
              };
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      return { 
        success: true, 
        result: { 
          isLoggedIn: false,
          username: null
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 数据处理操作 ===

/**
 * 数据提取操作
 */
class DataExtractOperation {
  constructor(config) {
    this.dataSource = config.dataSource;
    this.extractors = config.extractors || [];
    this.filters = config.filters || [];
  }

  async execute(page) {
    try {
      let data = this.dataSource;
      
      // 如果dataSource是函数，执行它
      if (typeof this.dataSource === 'function') {
        data = await this.dataSource(page);
      }
      
      // 应用提取器
      for (const extractor of this.extractors) {
        data = await extractor(data);
      }
      
      // 应用过滤器
      for (const filter of this.filters) {
        data = data.filter(filter);
      }
      
      return { success: true, result: data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 数据验证操作
 */
class DataValidateOperation {
  constructor(config) {
    this.validators = config.validators || [];
    this.data = config.data;
  }

  async execute(page) {
    try {
      let isValid = true;
      let errors = [];
      
      for (const validator of this.validators) {
        const result = await validator(this.data);
        if (!result.valid) {
          isValid = false;
          errors.push(result.error);
        }
      }
      
      return { 
        success: true, 
        result: { 
          isValid: isValid,
          errors: errors,
          data: this.data
        } 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 文件操作 ===

/**
 * 文件读取操作
 */
class FileReadOperation {
  constructor(config) {
    this.filePath = config.filePath;
    this.encoding = config.encoding || 'utf8';
    this.format = config.format || 'json';
  }

  async execute(page) {
    try {
      const fs = await import('fs');
      const data = fs.readFileSync(this.filePath, this.encoding);
      
      let result;
      if (this.format === 'json') {
        result = JSON.parse(data);
      } else {
        result = data;
      }
      
      return { success: true, result: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 文件写入操作
 */
class FileWriteOperation {
  constructor(config) {
    this.filePath = config.filePath;
    this.data = config.data;
    this.encoding = config.encoding || 'utf8';
    this.format = config.format || 'json';
  }

  async execute(page) {
    try {
      const fs = await import('fs');
      const fsPromises = await import('fs').then(m => m.promises);
      
      // 确保目录存在
      const dir = require('path').dirname(this.filePath);
      await fsPromises.mkdir(dir, { recursive: true });
      
      let content;
      if (this.format === 'json') {
        content = JSON.stringify(this.data, null, 2);
      } else {
        content = this.data;
      }
      
      await fsPromises.writeFile(this.filePath, content, this.encoding);
      
      return { success: true, result: this.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 条件操作 ===

/**
 * 条件执行操作
 */
class ConditionalOperation {
  constructor(config) {
    this.condition = config.condition;
    this.trueOperation = config.trueOperation;
    this.falseOperation = config.falseOperation;
  }

  async execute(page) {
    try {
      const conditionResult = await this.condition(page);
      
      if (conditionResult) {
        if (this.trueOperation) {
          return await this.trueOperation.execute(page);
        }
      } else {
        if (this.falseOperation) {
          return await this.falseOperation.execute(page);
        }
      }
      
      return { success: true, result: conditionResult };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

/**
 * 循环操作
 */
class LoopOperation {
  constructor(config) {
    this.count = config.count || 1;
    this.operation = config.operation;
    this.condition = config.condition;
  }

  async execute(page) {
    try {
      const results = [];
      let i = 0;
      
      while (i < this.count) {
        if (this.condition) {
          const shouldContinue = await this.condition(page, i);
          if (!shouldContinue) break;
        }
        
        const result = await this.operation.execute(page);
        results.push(result);
        i++;
      }
      
      return { success: true, result: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// === 操作工厂 ===

class AtomicOperationFactory {
  static createOperation(type, config) {
    switch (type) {
      // 基础元素操作
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
      
      // 页面操作
      case 'page.navigate':
        return new PageNavigationOperation(config);
      case 'page.wait':
        return new PageWaitOperation(config);
      case 'page.scroll':
        return new PageScrollOperation(config);
      
      // Cookie虚拟操作子
      case 'cookie.load':
        return new CookieLoadOperation(config);
      case 'cookie.validate':
        return new CookieValidateOperation(config);
      case 'login.check':
        return new LoginStatusCheckOperation(config);
      
      // 数据处理操作
      case 'data.extract':
        return new DataExtractOperation(config);
      case 'data.validate':
        return new DataValidateOperation(config);
      
      // 文件操作
      case 'file.read':
        return new FileReadOperation(config);
      case 'file.write':
        return new FileWriteOperation(config);
      
      // 条件操作
      case 'conditional':
        return new ConditionalOperation(config);
      case 'loop':
        return new LoopOperation(config);
      
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }
}

module.exports = {
  // 基础元素操作
  ElementExistsOperation,
  ElementClickOperation,
  ElementInputOperation,
  ElementTextOperation,
  ElementAttributeOperation,
  ElementVisibleOperation,
  
  // 页面操作
  PageNavigationOperation,
  PageWaitOperation,
  PageScrollOperation,
  
  // Cookie虚拟操作子
  CookieLoadOperation,
  CookieValidateOperation,
  LoginStatusCheckOperation,
  
  // 数据处理操作
  DataExtractOperation,
  DataValidateOperation,
  
  // 文件操作
  FileReadOperation,
  FileWriteOperation,
  
  // 条件操作
  ConditionalOperation,
  LoopOperation,
  
  // 工厂类
  AtomicOperationFactory
};