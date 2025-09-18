#!/usr/bin/env node

/**
 * WebAuto Comment Count Detection System
 *
 * Advanced system for detecting comment counts from webpages with multiple strategies
 */

import { EventEmitter } from 'events';

// Core interfaces
export interface CommentCountDetectionConfig {
  strategies: DetectionStrategy[];
  fallbackStrategies: DetectionStrategy[];
  timeout: number;
  retries: number;
  userAgent?: string;
  enableJavaScript: boolean;
  waitStrategy: 'none' | 'fixed' | 'smart';
  waitTimeout: number;
  enableCache: boolean;
  cacheTTL: number;
}

export interface DetectionStrategy {
  name: string;
  type: 'selector' | 'api' | 'regex' | 'attribute' | 'custom';
  target: string;
  extractor: string | Function;
  priority: number;
  confidence: number;
  platforms?: string[];
  conditions?: StrategyCondition[];
  postProcess?: (value: any) => number;
}

export interface StrategyCondition {
  type: 'url' | 'content' | 'header' | 'element';
  pattern: string;
  required?: boolean;
}

export interface DetectionResult {
  count: number;
  method: string;
  confidence: number;
  executionTime: number;
  strategy: DetectionStrategy;
  metadata: {
    userAgent?: string;
    platform?: string;
    timestamp: Date;
    attempts: number;
    errors: string[];
    fallbackUsed: boolean;
  };
}

export interface PlatformConfig {
  name: string;
  urlPatterns: string[];
  strategies: string[];
  selectors: PlatformSelectors;
  apiEndpoints?: ApiEndpoint[];
  behaviors?: PlatformBehavior;
}

export interface PlatformSelectors {
  commentCount: string[];
  commentSection: string[];
  commentItems: string[];
  loadMoreButton?: string;
  pagination?: string;
}

export interface ApiEndpoint {
  endpoint: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
  responsePath: string;
  rateLimit: number;
}

export interface PlatformBehavior {
  scrollRequired: boolean;
  clickRequired: boolean;
  infiniteScroll: boolean;
  lazyLoading: boolean;
  pagination: boolean;
  commentInteraction: boolean;
}

// Main detection system class
export class CommentCountDetector extends EventEmitter {
  private config: CommentCountDetectionConfig;
  private platforms: Map<string, PlatformConfig> = new Map();
  private cache: Map<string, CacheEntry> = new Map();

  constructor(config: CommentCountDetectionConfig) {
    super();
    this.config = config;
    this.setupEventHandlers();
    this.initializePlatforms();
  }

  private setupEventHandlers(): void {
    this.on('detectionStarted', (url: string, strategy: string) => {
      console.log(`🔍 Starting comment count detection for ${url} using ${strategy}`);
    });

    this.on('detectionCompleted', (result: DetectionResult) => {
      const confidence = (result.confidence * 100).toFixed(1);
      console.log(`✅ Detection completed: ${result.count} comments (${confidence}% confidence)`);
    });

    this.on('detectionFailed', (url: string, error: Error) => {
      console.error(`❌ Detection failed for ${url}: ${error.message}`);
    });

    this.on('fallbackUsed', (url: string, primary: string, fallback: string) => {
      console.log(`⚠️ Fallback used for ${url}: ${primary} → ${fallback}`);
    });
  }

  private initializePlatforms(): void {
    // Initialize platform configurations
    this.platforms.set('weibo', {
      name: 'Weibo',
      urlPatterns: [
        'weibo.com/\\d+',
        'weibo.com/[a-zA-Z0-9_]+'
      ],
      strategies: ['weibo-selector', 'weibo-api', 'weibo-regex'],
      selectors: {
        commentCount: [
          '.comment-count',
          '.comments-num',
          '[data-comment-count]',
          '.feed_comment .num',
          '.card-act .item-2'
        ],
        commentSection: [
          '.comment_list',
          '.feed_comments',
          '.comments-container'
        ],
        commentItems: [
          '.comment-item',
          '.feed_comment',
          '.comment-list li'
        ],
        loadMoreButton: [
          '.more_comments',
          '.load-more-comments'
        ],
        pagination: [
          '.next-page',
          '.page-next'
        ]
      },
      apiEndpoints: [
        {
          endpoint: '/comments/hotflow',
          method: 'POST',
          responsePath: 'data.total_number',
          rateLimit: 100
        },
        {
          endpoint: '/comments/show',
          method: 'GET',
          responsePath: 'total_number',
          rateLimit: 100
        }
      ],
      behaviors: {
        scrollRequired: true,
        clickRequired: false,
        infiniteScroll: true,
        lazyLoading: true,
        pagination: false,
        commentInteraction: false
      }
    });

    this.platforms.set('twitter', {
      name: 'Twitter',
      urlPatterns: [
        'twitter.com/[a-zA-Z0-9_]+/status/\\d+'
      ],
      strategies: ['twitter-selector', 'twitter-api'],
      selectors: {
        commentCount: [
          '[data-testid="reply"]',
          '.css-1dbjc4n.r-1kbdv8c.r-18u37iz',
          '[aria-label*="replies"]'
        ],
        commentSection: [
          '[data-testid="tweet"]',
          '.css-1dbjc4n.r-18u37iz'
        ],
        commentItems: [
          '[data-testid="tweet"]',
          '.css-1dbjc4n.r-1iusvr4'
        ]
      },
      behaviors: {
        scrollRequired: true,
        clickRequired: false,
        infiniteScroll: true,
        lazyLoading: true,
        pagination: false,
        commentInteraction: false
      }
    });

    this.platforms.set('facebook', {
      name: 'Facebook',
      urlPatterns: [
        'facebook.com/[^/]+/posts/\\d+',
        'facebook.com/permalink.php'
      ],
      strategies: ['facebook-selector', 'facebook-api'],
      selectors: {
        commentCount: [
          '[data-comment-count]',
          '.commentable_item .uiCommentCount',
          '[aria-label*="comment"]'
        ],
        commentSection: [
          '.commentable_item',
          '.UFIList'
        ],
        commentItems: [
          '.UFIComment',
          '.commentable_item .UFICommentContentBlock'
        ]
      },
      behaviors: {
        scrollRequired: false,
        clickRequired: true,
        infiniteScroll: false,
        lazyLoading: true,
        pagination: false,
        commentInteraction: true
      }
    });
  }

  // Main detection method
  public async detectCommentCount(url: string, options?: {
    forceRefresh?: boolean;
    specificStrategy?: string;
    userAgent?: string;
  }): Promise<DetectionResult> {
    // Check cache first
    const cacheKey = this.generateCacheKey(url);
    if (!options?.forceRefresh && this.config.enableCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && !this.isCacheExpired(cached)) {
        return cached.result;
      }
    }

    // Detect platform
    const platform = this.detectPlatform(url);
    this.emit('detectionStarted', url, platform);

    try {
      // Get applicable strategies
      const strategies = this.getApplicableStrategies(url, platform, options?.specificStrategy);

      let result: DetectionResult | null = null;
      let attempts = 0;

      // Try each strategy in order
      for (const strategy of strategies) {
        attempts++;
        try {
          result = await this.executeStrategy(url, strategy, platform);
          if (result.count > 0 && result.confidence >= 0.5) {
            break;
          }
        } catch (error) {
          this.emit('strategyFailed', url, strategy.name, error);
          continue;
        }
      }

      // If no successful result, try fallback strategies
      if (!result || result.count === 0) {
        for (const fallbackStrategy of this.config.fallbackStrategies) {
          try {
            this.emit('fallbackUsed', url, strategies[0]?.name || 'unknown', fallbackStrategy.name);
            result = await this.executeStrategy(url, fallbackStrategy, platform);
            if (result.count > 0) {
              result.metadata.fallbackUsed = true;
              break;
            }
          } catch (error) {
            this.emit('strategyFailed', url, fallbackStrategy.name, error);
            continue;
          }
        }
      }

      // If still no result, return default
      if (!result) {
        result = this.createDefaultResult(url);
      }

      result.metadata.attempts = attempts;
      result.metadata.timestamp = new Date();

      // Cache result
      if (this.config.enableCache) {
        this.cache.set(cacheKey, {
          result,
          timestamp: Date.now(),
          ttl: this.config.cacheTTL
        });
      }

      this.emit('detectionCompleted', result);
      return result;

    } catch (error) {
      this.emit('detectionFailed', url, error as Error);
      throw error;
    }
  }

  private detectPlatform(url: string): string {
    for (const [platformName, platformConfig] of this.platforms) {
      for (const pattern of platformConfig.urlPatterns) {
        const regex = new RegExp(pattern);
        if (regex.test(url)) {
          return platformName;
        }
      }
    }
    return 'generic';
  }

  private getApplicableStrategies(url: string, platform: string, specificStrategy?: string): DetectionStrategy[] {
    let strategies = this.config.strategies;

    // Filter by platform-specific strategies if available
    const platformConfig = this.platforms.get(platform);
    if (platformConfig) {
      strategies = strategies.filter(s =>
        !s.platforms || s.platforms.includes(platform)
      );
    }

    // Filter by specific strategy if requested
    if (specificStrategy) {
      strategies = strategies.filter(s => s.name === specificStrategy);
    }

    // Sort by priority
    return strategies.sort((a, b) => b.priority - a.priority);
  }

  private async executeStrategy(url: string, strategy: DetectionStrategy, platform: string): Promise<DetectionResult> {
    const startTime = Date.now();

    try {
      let count = 0;
      let confidence = strategy.confidence;

      switch (strategy.type) {
        case 'selector':
          count = await this.executeSelectorStrategy(url, strategy, platform);
          break;
        case 'api':
          count = await this.executeApiStrategy(url, strategy, platform);
          break;
        case 'regex':
          count = await this.executeRegexStrategy(url, strategy, platform);
          break;
        case 'attribute':
          count = await this.executeAttributeStrategy(url, strategy, platform);
          break;
        case 'custom':
          count = await this.executeCustomStrategy(url, strategy, platform);
          break;
        default:
          throw new Error(`Unknown strategy type: ${strategy.type}`);
      }

      // Apply post-processing if provided
      if (strategy.postProcess) {
        count = strategy.postProcess(count);
      }

      const executionTime = Date.now() - startTime;

      // Adjust confidence based on result
      if (count === 0) {
        confidence *= 0.3; // Lower confidence for zero results
      } else if (count > 10000) {
        confidence *= 0.8; // Slightly lower confidence for very high counts
      }

      return {
        count,
        method: strategy.name,
        confidence: Math.max(0, Math.min(1, confidence)),
        executionTime,
        strategy,
        metadata: {
          platform,
          timestamp: new Date(),
          attempts: 0,
          errors: [],
          fallbackUsed: false
        }
      };

    } catch (error) {
      throw new Error(`Strategy ${strategy.name} failed: ${(error as Error).message}`);
    }
  }

  private async executeSelectorStrategy(url: string, strategy: DetectionStrategy, platform: string): Promise<number> {
    // This is a placeholder for actual implementation
    // In real implementation, this would use puppeteer/playwright to:
    // 1. Load the webpage
    // 2. Wait for content to load
    // 3. Execute selector to find comment count
    // 4. Extract and return the count

    // For demo purposes, return simulated data
    const platformConfig = this.platforms.get(platform);
    const selectors = platformConfig?.selectors.commentCount || [strategy.target];

    // Simulate selector-based extraction
    const mockCount = Math.floor(Math.random() * 200) + 5;
    return mockCount;
  }

  private async executeApiStrategy(url: string, strategy: DetectionStrategy, platform: string): Promise<number> {
    // This is a placeholder for actual implementation
    // In real implementation, this would:
    // 1. Extract necessary parameters from URL
    // 2. Make API request to platform endpoint
    // 3. Parse response and extract comment count
    // 4. Handle rate limiting and authentication

    // For demo purposes, return simulated data
    const mockCount = Math.floor(Math.random() * 300) + 10;
    return mockCount;
  }

  private async executeRegexStrategy(url: string, strategy: DetectionStrategy, platform: string): Promise<number> {
    // This is a placeholder for actual implementation
    // In real implementation, this would:
    // 1. Fetch page content
    // 2. Apply regex pattern to extract comment count
    // 3. Parse and return the count

    // For demo purposes, return simulated data
    const mockCount = Math.floor(Math.random() * 150) + 3;
    return mockCount;
  }

  private async executeAttributeStrategy(url: string, strategy: DetectionStrategy, platform: string): Promise<number> {
    // This is a placeholder for actual implementation
    // In real implementation, this would:
    // 1. Load the webpage
    // 2. Find element with specified attribute
    // 3. Extract and parse attribute value

    // For demo purposes, return simulated data
    const mockCount = Math.floor(Math.random() * 100) + 1;
    return mockCount;
  }

  private async executeCustomStrategy(url: string, strategy: DetectionStrategy, platform: string): Promise<number> {
    // This is a placeholder for actual implementation
    // In real implementation, this would execute custom logic

    if (typeof strategy.extractor === 'function') {
      return await strategy.extractor(url, platform);
    }

    throw new Error('Custom extractor must be a function');
  }

  private createDefaultResult(url: string): DetectionResult {
    return {
      count: 0,
      method: 'default',
      confidence: 0.1,
      executionTime: 0,
      strategy: {
        name: 'default',
        type: 'custom',
        target: '',
        extractor: '',
        priority: 0,
        confidence: 0.1
      },
      metadata: {
        timestamp: new Date(),
        attempts: 0,
        errors: ['All strategies failed'],
        fallbackUsed: false
      }
    };
  }

  private generateCacheKey(url: string): string {
    return `comment_count_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  private isCacheExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  // Utility methods
  public async detectMultiple(urls: string[], options?: {
    concurrency?: number;
    forceRefresh?: boolean;
  }): Promise<Map<string, DetectionResult>> {
    const concurrency = options?.concurrency || 5;
    const results = new Map<string, DetectionResult>();

    // Process URLs in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const promises = batch.map(async (url) => {
        try {
          const result = await this.detectCommentCount(url, options);
          results.set(url, result);
        } catch (error) {
          results.set(url, this.createDefaultResult(url));
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  public getCacheStats(): any {
    const now = Date.now();
    const validEntries = Array.from(this.cache.values()).filter(entry =>
      now - entry.timestamp < entry.ttl
    );
    const expiredEntries = Array.from(this.cache.values()).filter(entry =>
      now - entry.timestamp >= entry.ttl
    );

    return {
      totalEntries: this.cache.size,
      validEntries: validEntries.length,
      expiredEntries: expiredEntries.length,
      hitRate: validEntries.length / Math.max(1, this.cache.size)
    };
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public addPlatform(config: PlatformConfig): void {
    this.platforms.set(config.name, config);
  }

  public getPlatforms(): PlatformConfig[] {
    return Array.from(this.platforms.values());
  }

  public getConfig(): CommentCountDetectionConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<CommentCountDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Utility interfaces and functions
interface CacheEntry {
  result: DetectionResult;
  timestamp: number;
  ttl: number;
}

export function createDefaultConfig(): CommentCountDetectionConfig {
  return {
    strategies: [
      {
        name: 'primary-selector',
        type: 'selector',
        target: '.comment-count',
        extractor: 'text',
        priority: 10,
        confidence: 0.9,
        postProcess: (value: any) => parseInt(value) || 0
      },
      {
        name: 'api-endpoint',
        type: 'api',
        target: '/api/comments',
        extractor: 'total_count',
        priority: 8,
        confidence: 0.95
      },
      {
        name: 'attribute-based',
        type: 'attribute',
        target: 'data-comment-count',
        extractor: 'value',
        priority: 6,
        confidence: 0.8
      },
      {
        name: 'regex-pattern',
        type: 'regex',
        target: '\\b(\\d+)\\s*comments?\\b',
        extractor: 'match',
        priority: 4,
        confidence: 0.6
      }
    ],
    fallbackStrategies: [
      {
        name: 'generic-selector',
        type: 'selector',
        target: '[class*="comment"] [class*="count"]',
        extractor: 'text',
        priority: 2,
        confidence: 0.4
      }
    ],
    timeout: 10000,
    retries: 3,
    enableJavaScript: true,
    waitStrategy: 'smart',
    waitTimeout: 5000,
    enableCache: true,
    cacheTTL: 300000 // 5 minutes
  };
}

export function createWeiboSpecificConfig(): CommentCountDetectionConfig {
  const baseConfig = createDefaultConfig();

  // Add Weibo-specific strategies
  baseConfig.strategies.unshift(
    {
      name: 'weibo-feed-comment',
      type: 'selector',
      target: '.feed_comment .num',
      extractor: 'text',
      priority: 15,
      confidence: 0.95,
      platforms: ['weibo'],
      postProcess: (value: any) => {
        const text = typeof value === 'string' ? value : '';
        const match = text.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      }
    },
    {
      name: 'weibo-card-act',
      type: 'selector',
      target: '.card-act .item-2',
      extractor: 'text',
      priority: 12,
      confidence: 0.9,
      platforms: ['weibo']
    }
  );

  return baseConfig;
}

// Default export
export default CommentCountDetector;

// CLI entry point
if (require.main === module) {
  // This would be the CLI implementation
  console.log('WebAuto Comment Count Detection System');
  console.log('Usage: node index.ts <url> [options]');
}