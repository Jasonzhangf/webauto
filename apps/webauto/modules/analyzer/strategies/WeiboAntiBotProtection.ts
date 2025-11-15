import { EventEmitter } from 'events';

/**
 * 防反机器人保护机制
 * 提供时间控制、行为模拟、请求频率限制等功能
 */

export interface HumanBehaviorConfig {
  mouseMovement: {
    randomMoves: boolean;
    scrollVariation: [number, number];
    pauseProbability: number;
  };
  viewport: {
    resizeRandom: boolean;
    focusChange: boolean;
    scrollBack: boolean;
  };
  keyboard: {
    randomKeys: boolean;
    searchSimulate: boolean;
  };
}

export interface DelayConfig {
  scroll: [number, number];      // 滚动延迟范围
  click: [number, number];       // 点击延迟范围
  pageLoad: [number, number];    // 页面切换延迟
  dataExtraction: [number, number]; // 数据提取延迟
}

export interface RequestLimitConfig {
  maxConcurrent: number;
  requestInterval: number;
  failureBackoff: {
    initial: number;
    max: number;
    multiplier: number;
  };
  peakHours: {
    start: number;  // 小时 (0-23)
    end: number;    // 小时 (0-23)
  };
}

export interface BrowserFingerprintConfig {
  userAgent: {
    rotation: boolean;
    commonBrowsers: string[];
    versionRanges: string[];
  };
  viewport: {
    common: string[];
    randomOffset: [number, number];
  };
  locale: {
    timezones: string[];
    languages: string[];
  };
}

export interface AdaptiveControlConfig {
  delayAdjustment: {
    baseDelay: number;
    maxDelay: number;
    increaseRate: number;
    decreaseRate: number;
  };
  successRate: {
    threshold: number;
    windowSize: number;
    adjustmentStep: number;
  };
}

export class WeiboAntiBotProtection extends EventEmitter {
  private config: {
    delays: DelayConfig;
    behavior: HumanBehaviorConfig;
    requestLimit: RequestLimitConfig;
    fingerprint: BrowserFingerprintConfig;
    adaptive: AdaptiveControlConfig;
  };

  private operationHistory: Array<{
    timestamp: number;
    type: string;
    success: boolean;
    duration: number;
  }> = [];

  private currentDelay: number;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private consecutiveFailures: number = 0;

  constructor(config?: any) {
    super();
    
    this.config = {
      delays: {
        scroll: [2000, 5000],      // 2-5秒
        click: [1000, 3000],       // 1-3秒
        pageLoad: [3000, 8000],    // 3-8秒
        dataExtraction: [500, 2000] // 0.5-2秒
      },
      behavior: {
        mouseMovement: {
          randomMoves: true,
          scrollVariation: [0.7, 1.3],
          pauseProbability: 0.15
        },
        viewport: {
          resizeRandom: false,  // 在实际环境中可以开启
          focusChange: false,
          scrollBack: true
        },
        keyboard: {
          randomKeys: false,     // 在实际环境中可以开启
          searchSimulate: false
        }
      },
      requestLimit: {
        maxConcurrent: 3,
        requestInterval: 30000, // 30秒
        failureBackoff: {
          initial: 5000,
          max: 300000, // 5分钟
          multiplier: 1.5
        },
        peakHours: {
          start: 19,
          end: 23
        }
      },
      fingerprint: {
        userAgent: {
          rotation: false, // 需要特殊环境支持
          commonBrowsers: ['Chrome', 'Firefox', 'Safari'],
          versionRanges: ['90-100', '85-95', '14-16']
        },
        viewport: {
          common: ['1920x1080', '1366x768', '1440x900'],
          randomOffset: [-100, 100]
        },
        locale: {
          timezones: ['Asia/Shanghai', 'Asia/Beijing'],
          languages: ['zh-CN', 'zh']
        }
      },
      adaptive: {
        delayAdjustment: {
          baseDelay: 3000,
          maxDelay: 300000, // 5分钟
          increaseRate: 1.5,
          decreaseRate: 0.8
        },
        successRate: {
          threshold: 0.8, // 80%成功率
          windowSize: 20,
          adjustmentStep: 1000
        }
      },
      ...config
    };

    this.currentDelay = this.config.adaptive.delayAdjustment.baseDelay;
  }

  /**
   * 执行防反机器人延迟
   */
  async executeDelay(type: keyof DelayConfig, additionalDelay: number = 0): Promise<void> {
    const [min, max] = this.config.delays[type];
    const adaptiveDelay = this.calculateAdaptiveDelay();
    const baseDelay = Math.random() * (max - min) + min;
    const totalDelay = baseDelay + adaptiveDelay + additionalDelay;

    this.emit('delayStart', { type, duration: totalDelay });
    
    await this.delay(totalDelay);
    
    this.emit('delayComplete', { type, duration: totalDelay });
  }

  /**
   * 模拟人类鼠标行为
   */
  async simulateMouseBehavior(page: any): Promise<void> {
    if (!this.config.behavior.mouseMovement.randomMoves) return;

    try {
      const viewport = page.viewport();
      const moves = 3 + Math.floor(Math.random() * 5); // 3-7次移动
      
      for (let i = 0; i < moves; i++) {
        const x = Math.random() * viewport.width;
        const y = Math.random() * viewport.height;
        
        await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) });
        
        if (Math.random() < this.config.behavior.mouseMovement.pauseProbability) {
          await this.delay(500 + Math.random() * 2000);
        }
      }

      this.emit('mouseBehaviorSimulated', { moves });
    } catch (error) {
      console.error('Error simulating mouse behavior:', error);
    }
  }

  /**
   * 模拟滚动行为
   */
  async simulateScrollBehavior(page: any): Promise<void> {
    try {
      const [minVariation, maxVariation] = this.config.behavior.mouseMovement.scrollVariation;
      const variation = Math.random() * (maxVariation - minVariation) + minVariation;
      
      // 随机滚动距离
      const scrollDistance = 100 + Math.random() * 300;
      const adjustedDistance = scrollDistance * variation;
      
      await page.evaluate((distance) => {
        window.scrollBy({
          top: distance,
          behavior: 'smooth'
        });
      }, adjustedDistance);

      // 偶尔回滚
      if (this.config.behavior.viewport.scrollBack && Math.random() < 0.3) {
        await this.delay(1000 + Math.random() * 2000);
        await page.evaluate(() => {
          window.scrollBy({
            top: -100,
            behavior: 'smooth'
          });
        });
      }

      this.emit('scrollBehaviorSimulated', { distance: adjustedDistance });
    } catch (error) {
      console.error('Error simulating scroll behavior:', error);
    }
  }

  /**
   * 检查请求频率限制
   */
  async checkRequestLimit(): Promise<boolean> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // 检查最小间隔
    if (timeSinceLastRequest < this.config.requestLimit.requestInterval) {
      const waitTime = this.config.requestLimit.requestInterval - timeSinceLastRequest;
      await this.delay(waitTime);
      this.emit('requestDelayed', { waitTime });
    }

    // 检查高峰时段
    if (this.isPeakHour()) {
      const additionalDelay = Math.random() * 10000 + 5000; // 5-15秒额外延迟
      await this.delay(additionalDelay);
      this.emit('peakHourDelay', { additionalDelay });
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
    
    return true;
  }

  /**
   * 处理操作失败
   */
  handleFailure(error: any, operationType: string): void {
    this.consecutiveFailures++;
    
    // 记录失败
    this.recordOperation(operationType, false, 0);
    
    // 计算退避延迟
    const backoffDelay = this.calculateBackoffDelay();
    this.currentDelay = Math.min(
      this.currentDelay * this.config.adaptive.delayAdjustment.increaseRate,
      this.config.adaptive.delayAdjustment.maxDelay
    );

    this.emit('failureHandled', {
      operationType,
      consecutiveFailures: this.consecutiveFailures,
      backoffDelay,
      newDelay: this.currentDelay
    });
  }

  /**
   * 处理操作成功
   */
  handleSuccess(operationType: string, duration: number): void {
    this.consecutiveFailures = 0;
    
    // 记录成功
    this.recordOperation(operationType, true, duration);
    
    // 调整延迟
    if (this.getSuccessRate() > this.config.adaptive.successRate.threshold) {
      this.currentDelay = Math.max(
        this.currentDelay * this.config.adaptive.delayAdjustment.decreaseRate,
        this.config.adaptive.delayAdjustment.baseDelay
      );
    }

    this.emit('successHandled', {
      operationType,
      duration,
      successRate: this.getSuccessRate(),
      newDelay: this.currentDelay
    });
  }

  /**
   * 检测反爬触发信号
   */
  async detectAntiBotSignals(page: any): Promise<{
    detected: boolean;
    signals: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    const signals: string[] = [];
    
    try {
      // 检测验证码
      const captcha = await page.evaluate(() => {
        const captchaSelectors = [
          '.captcha',
          '#captcha',
          '.verify',
          '[class*="captcha"]',
          '[id*="verify"]'
        ];
        
        return captchaSelectors.some(selector => {
          const element = document.querySelector(selector);
          return element && element.offsetParent !== null;
        });
      });
      
      if (captcha) signals.push('captcha');

      // 检测IP封禁提示
      const ipBlocked = await page.evaluate(() => {
        const blockedTexts = [
          '访问过于频繁',
          'IP被封禁',
          '请求异常',
          '系统繁忙'
        ];
        
        const pageText = document.body.textContent || '';
        return blockedTexts.some(text => pageText.includes(text));
      });
      
      if (ipBlocked) signals.push('ip_blocked');

      // 检测账号异常
      const accountError = await page.evaluate(() => {
        const errorTexts = [
          '登录异常',
          '账号异常',
          '安全验证',
          '身份验证'
        ];
        
        const pageText = document.body.textContent || '';
        return errorTexts.some(text => pageText.includes(text));
      });
      
      if (accountError) signals.push('account_error');

      // 检测重定向到登录页
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('signin')) {
        signals.push('redirect_to_login');
      }

      // 计算严重程度
      let severity: 'low' | 'medium' | 'high' = 'low';
      if (signals.includes('captcha') || signals.includes('ip_blocked')) {
        severity = 'high';
      } else if (signals.length > 1) {
        severity = 'medium';
      }

      const result = {
        detected: signals.length > 0,
        signals,
        severity
      };

      if (result.detected) {
        this.emit('antiBotDetected', result);
      }

      return result;

    } catch (error) {
      console.error('Error detecting anti-bot signals:', error);
      return { detected: false, signals: [], severity: 'low' };
    }
  }

  /**
   * 计算自适应延迟
   */
  private calculateAdaptiveDelay(): number {
    return this.currentDelay - this.config.adaptive.delayAdjustment.baseDelay;
  }

  /**
   * 计算退避延迟
   */
  private calculateBackoffDelay(): number {
    const { initial, max, multiplier } = this.config.requestLimit.failureBackoff;
    return Math.min(initial * Math.pow(multiplier, this.consecutiveFailures - 1), max);
  }

  /**
   * 记录操作
   */
  private recordOperation(type: string, success: boolean, duration: number): void {
    this.operationHistory.push({
      timestamp: Date.now(),
      type,
      success,
      duration
    });

    // 保持历史记录在窗口大小内
    const windowSize = this.config.adaptive.successRate.windowSize;
    if (this.operationHistory.length > windowSize * 2) {
      this.operationHistory = this.operationHistory.slice(-windowSize * 2);
    }
  }

  /**
   * 获取成功率
   */
  private getSuccessRate(): number {
    const windowSize = this.config.adaptive.successRate.windowSize;
    const recentOperations = this.operationHistory.slice(-windowSize);
    
    if (recentOperations.length === 0) return 1;
    
    const successCount = recentOperations.filter(op => op.success).length;
    return successCount / recentOperations.length;
  }

  /**
   * 检查是否为高峰时段
   */
  private isPeakHour(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const { start, end } = this.config.requestLimit.peakHours;
    
    if (start <= end) {
      return hour >= start && hour <= end;
    } else {
      // 跨午夜的情况
      return hour >= start || hour <= end;
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    return {
      currentDelay: this.currentDelay,
      requestCount: this.requestCount,
      consecutiveFailures: this.consecutiveFailures,
      successRate: this.getSuccessRate(),
      operationHistory: this.operationHistory.slice(-10) // 最近10次操作
    };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.operationHistory = [];
    this.currentDelay = this.config.adaptive.delayAdjustment.baseDelay;
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.consecutiveFailures = 0;
    this.emit('reset');
  }
}