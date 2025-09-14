import { EventEmitter } from 'eventemitter3';
import { 
  BrowserSessionManager, 
  BrowserSession, 
  NavigationOptions,
  NavigationResult,
  CookieData
} from '@webauto/browser-session-manager';
import { 
  ContentCapturer, 
  CapturedContent, 
  CaptureResult,
  CaptureOptions,
  ContentCaptureConfig
} from '@webauto/content-capturer';
import { 
  LinkExtractor, 
  ExtractedLink, 
  ExtractionResult,
  ExtractionContext,
  LinkExtractorConfig
} from '@webauto/link-extractor';
import { 
  StorageManager, 
  StorageConfig,
  StoredContent 
} from '@webauto/storage-manager';
import { 
  SmartAnalyzer,
  AnalysisResult,
  AnalysisOptions
} from '@webauto/smart-analyzer';

/**
 * Base interface for all Weibo tasks
 */
export interface WeiboTaskConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  browserConfig?: any;
  captureConfig?: Partial<ContentCaptureConfig>;
  extractorConfig?: Partial<LinkExtractorConfig>;
  storageConfig?: Partial<StorageConfig>;
  analysisConfig?: AnalysisOptions;
}

/**
 * Base interface for task execution results
 */
export interface WeiboTaskResult {
  taskId: string;
  success: boolean;
  capturedContent: CapturedContent[];
  extractedLinks: ExtractedLink[];
  analysisResults: AnalysisResult[];
  errors: string[];
  warnings: string[];
  metrics: {
    executionTime: number;
    linksExtracted: number;
    contentCaptured: number;
    storageOperations: number;
    analysisPerformed: number;
  };
  timestamp: Date;
}

/**
 * Base class for all Weibo automation tasks
 */
export abstract class WeiboTaskExecutor extends EventEmitter {
  protected config: WeiboTaskConfig;
  protected browserManager: BrowserSessionManager;
  protected contentCapturer: ContentCapturer;
  protected linkExtractor: LinkExtractor;
  protected storageManager: StorageManager;
  protected smartAnalyzer: SmartAnalyzer;
  protected session: BrowserSession | null = null;
  protected isRunning = false;
  protected startTime: Date | null = null;

  constructor(config: WeiboTaskConfig) {
    super();
    this.config = config;
    
    // Initialize modules with default configurations
    this.browserManager = new BrowserSessionManager(this.config.browserConfig);
    this.contentCapturer = new ContentCapturer(this.config.captureConfig);
    this.linkExtractor = new LinkExtractor(this.config.extractorConfig);
    this.storageManager = new StorageManager(this.config.storageConfig);
    this.smartAnalyzer = new SmartAnalyzer();
  }

  /**
   * Initialize all modules and establish browser session
   */
  async initialize(): Promise<void> {
    this.emit('initialization_started', { taskId: this.config.id });
    
    try {
      // Initialize all modules
      await this.browserManager.initialize();
      await this.contentCapturer.initialize();
      await this.linkExtractor.initialize();
      await this.storageManager.initialize();
      await this.smartAnalyzer.initialize();

      // Create browser session
      this.session = await this.browserManager.createSession({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        headless: false
      });

      this.emit('initialization_completed', { taskId: this.config.id });
    } catch (error) {
      this.emit('initialization_failed', { 
        taskId: this.config.id, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Execute the task with retry logic
   */
  async execute(): Promise<WeiboTaskResult> {
    if (!this.session) {
      throw new Error('Session not initialized. Call initialize() first.');
    }

    this.isRunning = true;
    this.startTime = new Date();
    
    this.emit('execution_started', { 
      taskId: this.config.id, 
      timestamp: this.startTime 
    });

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= this.config.maxRetries && this.isRunning) {
      attempt++;
      this.emit('execution_attempt', { 
        taskId: this.config.id, 
        attempt,
        maxAttempts: this.config.maxRetries + 1
      });

      try {
        const result = await this.executeWithTimeout();
        
        if (result.success) {
          this.isRunning = false;
          this.emit('execution_completed', { 
            taskId: this.config.id, 
            result,
            attempt
          });
          return result;
        } else {
          throw new Error(`Task execution failed: ${result.errors.join(', ')}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.emit('execution_attempt_failed', { 
          taskId: this.config.id, 
          attempt,
          error: lastError.message
        });

        if (attempt <= this.config.maxRetries && this.isRunning) {
          // Wait before retry
          await this.delay(this.config.retryDelay);
          
          // Reinitialize session if needed
          if (this.isSessionRelatedError(lastError)) {
            await this.reinitializeSession();
          }
        }
      }
    }

    this.isRunning = false;
    const result: WeiboTaskResult = {
      taskId: this.config.id,
      success: false,
      capturedContent: [],
      extractedLinks: [],
      analysisResults: [],
      errors: [lastError?.message || 'Unknown error'],
      warnings: [],
      metrics: {
        executionTime: Date.now() - this.startTime.getTime(),
        linksExtracted: 0,
        contentCaptured: 0,
        storageOperations: 0,
        analysisPerformed: 0
      },
      timestamp: new Date()
    };

    this.emit('execution_failed', { 
      taskId: this.config.id, 
      result,
      finalError: lastError?.message
    });

    return result;
  }

  /**
   * Execute task with timeout protection
   */
  private async executeWithTimeout(): Promise<WeiboTaskResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task execution timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      this.executeCore()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Core execution logic to be implemented by subclasses
   */
  protected abstract executeCore(): Promise<WeiboTaskResult>;

  /**
   * Navigate to URL with error handling and retry
   */
  protected async navigateToUrl(url: string, options?: NavigationOptions): Promise<NavigationResult> {
    if (!this.session) {
      throw new Error('Session not initialized');
    }

    this.emit('navigation_started', { 
      taskId: this.config.id, 
      url 
    });

    try {
      const result = await this.session.navigateTo(url, options);
      
      this.emit('navigation_completed', { 
        taskId: this.config.id, 
        url,
        result 
      });

      return result;
    } catch (error) {
      this.emit('navigation_failed', { 
        taskId: this.config.id, 
        url,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Extract links from current page
   */
  protected async extractLinksFromPage(htmlContent: string, baseUrl: string): Promise<ExtractedLink[]> {
    const context: ExtractionContext = {
      url: baseUrl,
      startTime: new Date(),
      options: {
        includeExternal: false,
        includeImages: true,
        includeVideos: true,
        maxDepth: 1,
        followRedirects: true
      }
    };

    const result = await this.linkExtractor.extractLinks(htmlContent, context);
    return result.links;
  }

  /**
   * Capture content from URLs
   */
  protected async captureContentFromUrls(urls: string[]): Promise<CapturedContent[]> {
    const capturedContent: CapturedContent[] = [];

    for (const url of urls) {
      try {
        const result = await this.contentCapturer.captureContent(url, {
          fullPage: true,
          captureScreenshots: true,
          extractText: true
        });

        if (result.success && result.content) {
          capturedContent.push(result.content);
          this.emit('content_captured', { 
            taskId: this.config.id, 
            contentId: result.content.id,
            url 
          });
        }
      } catch (error) {
        this.emit('content_capture_failed', { 
          taskId: this.config.id, 
          url,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return capturedContent;
  }

  /**
   * Analyze captured content
   */
  protected async analyzeContent(content: CapturedContent[]): Promise<AnalysisResult[]> {
    const analysisResults: AnalysisResult[] = [];

    for (const item of content) {
      try {
        const result = await this.smartAnalyzer.analyze({
          content: item.data.content || '',
          metadata: item.metadata,
          options: this.config.analysisConfig
        });

        analysisResults.push(result);
        this.emit('content_analyzed', { 
          taskId: this.config.id, 
          contentId: item.id,
          result 
        });
      } catch (error) {
        this.emit('content_analysis_failed', { 
          taskId: this.config.id, 
          contentId: item.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return analysisResults;
  }

  /**
   * Store captured content
   */
  protected async storeContent(content: CapturedContent[]): Promise<void> {
    for (const item of content) {
      try {
        await this.storageManager.store(item);
        this.emit('content_stored', { 
          taskId: this.config.id, 
          contentId: item.id 
        });
      } catch (error) {
        this.emit('content_storage_failed', { 
          taskId: this.config.id, 
          contentId: item.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Check if error is session-related
   */
  private isSessionRelatedError(error: Error): boolean {
    const sessionErrorMessages = [
      'Session closed',
      'Session not found',
      'Target closed',
      'Connection lost',
      'Browser disconnected',
      'Page crashed'
    ];

    return sessionErrorMessages.some(msg => error.message.includes(msg));
  }

  /**
   * Reinitialize browser session
   */
  private async reinitializeSession(): Promise<void> {
    this.emit('session_reinitialization_started', { taskId: this.config.id });

    try {
      if (this.session) {
        await this.session.close();
      }

      this.session = await this.browserManager.createSession({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        headless: false
      });

      this.emit('session_reinitialization_completed', { taskId: this.config.id });
    } catch (error) {
      this.emit('session_reinitialization_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop task execution
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.emit('execution_stopped', { taskId: this.config.id });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.emit('cleanup_started', { taskId: this.config.id });

    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }

      await this.browserManager.destroy();
      await this.contentCapturer.destroy();
      await this.linkExtractor.destroy();
      await this.storageManager.destroy();
      await this.smartAnalyzer.destroy();

      this.emit('cleanup_completed', { taskId: this.config.id });
    } catch (error) {
      this.emit('cleanup_failed', { 
        taskId: this.config.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get task status
   */
  getStatus() {
    return {
      taskId: this.config.id,
      isRunning: this.isRunning,
      startTime: this.startTime,
      hasSession: this.session !== null,
      config: this.config
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WeiboTaskConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', { taskId: this.config.id, config: this.config });
  }
}