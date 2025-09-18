/**
 * Communication Operations - Micro-operations for HTTP and API communication
 */

import BaseOperation from '../core/BaseOperation';
import {
  OperationConfig,
  OperationResult,
  OperationContext
} from '../types';
import * as https from 'https';
import * as http from 'http';

/**
 * HTTP Request Operation - Make HTTP requests with various methods and options
 */
export class HttpRequestOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'HttpRequestOperation';
    this.description = 'Make HTTP requests with various methods and options';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['http-request', 'api-communication'];
    this.supportedContainers = ['web-service', 'api-client', 'any'];
    this.capabilities = ['http-communication', 'api-calls', 'data-retrieval'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['url'];
    this.optionalParameters = {
      method: 'GET',
      headers: {},
      body: null,
      timeout: 30000,
      followRedirects: true,
      maxRedirects: 5,
      validateSSL: true,
      userAgent: 'WebAuto/1.0',
      contentType: 'application/json',
      responseType: 'json', // 'json', 'text', 'buffer', 'stream'
      retryCount: 3,
      retryDelay: 1000,
      retryStatusCodes: [408, 429, 500, 502, 503, 504],
      auth: null,
      proxy: null,
      encoding: 'utf8',
      decompress: true,
      maxResponseSize: 10485760, // 10MB
      expectContinue: false
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting HTTP request operation', {
      url: finalParams.url,
      method: finalParams.method,
      params: finalParams
    });

    try {
      // Prepare request options
      const requestOptions = this.prepareRequestOptions(finalParams);

      // Make request with retry logic
      const response = await this.makeRequestWithRetry(requestOptions, finalParams);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'HTTP request completed', {
        url: finalParams.url,
        status: response.statusCode,
        executionTime
      });

      return {
        success: response.statusCode >= 200 && response.statusCode < 300,
        result: response,
        metadata: {
          url: finalParams.url,
          method: finalParams.method,
          status: response.statusCode,
          executionTime,
          retryCount: response.retryCount || 0
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'HTTP request failed', {
        url: finalParams.url,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          url: finalParams.url,
          method: finalParams.method,
          executionTime
        }
      };
    }
  }

  private prepareRequestOptions(params: OperationConfig): any {
    const url = new URL(params.url);
    const headers: Record<string, string> = {
      'User-Agent': params.userAgent,
      'Accept': this.getAcceptHeader(params.responseType),
      ...params.headers
    };

    // Add content type for methods that typically have bodies
    if (['POST', 'PUT', 'PATCH'].includes(params.method as string)) {
      if (!headers['Content-Type'] && params.contentType) {
        headers['Content-Type'] = params.contentType;
      }
    }

    // Add authentication
    if (params.auth) {
      if (params.auth.type === 'bearer') {
        headers['Authorization'] = `Bearer ${params.auth.token}`;
      } else if (params.auth.type === 'basic') {
        const credentials = Buffer.from(`${params.auth.username}:${params.auth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      } else if (params.auth.type === 'apikey') {
        headers[params.auth.headerName || 'X-API-Key'] = params.auth.apiKey;
      }
    }

    return {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: params.method,
      headers,
      timeout: params.timeout,
      body: params.body,
      responseType: params.responseType,
      maxResponseSize: params.maxResponseSize,
      validateSSL: params.validateSSL,
      decompress: params.decompress
    };
  }

  private async makeRequestWithRetry(options: any, params: OperationConfig): Promise<any> {
    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 1; attempt <= params.retryCount; attempt++) {
      try {
        this.log('debug', `HTTP request attempt ${attempt}/${params.retryCount}`, { url: options.hostname + options.path });

        const result = await this.makeSingleRequest(options, params);
        result.retryCount = retryCount;

        if (attempt > 1) {
          this.log('info', `HTTP request succeeded on attempt ${attempt}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        retryCount++;

        // Check if we should retry
        if (attempt < params.retryCount && this.shouldRetry(error, params)) {
          this.log('warn', `HTTP request attempt ${attempt} failed, retrying`, { error: (error as Error).message });

          if (params.retryDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, params.retryDelay));
          }
        } else {
          throw error;
        }
      }
    }

    throw lastError || new Error('HTTP request failed after all retries');
  }

  private async makeSingleRequest(options: any, params: OperationConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestLib = options.protocol === 'https:' ? https : http;

      const req = requestLib.request(options, (res) => {
        let responseData: any[] = [];
        let responseSize = 0;

        res.on('data', (chunk) => {
          responseSize += chunk.length;

          // Check response size limit
          if (responseSize > params.maxResponseSize) {
            req.destroy();
            reject(new Error(`Response size exceeds limit: ${responseSize} > ${params.maxResponseSize}`));
            return;
          }

          responseData.push(chunk);
        });

        res.on('end', () => {
          try {
            const responseBuffer = Buffer.concat(responseData);
            const processedData = this.processResponseData(responseBuffer, options.responseType);

            resolve({
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              data: processedData,
              size: responseBuffer.length,
              url: `${options.protocol}//${options.hostname}${options.path}`,
              method: options.method
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${options.timeout}ms`));
      });

      // Handle redirects
      if (params.followRedirects) {
        req.on('response', (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            req.destroy();
            // Handle redirect logic here
          }
        });
      }

      // Write body if provided
      if (options.body) {
        let bodyData: string | Buffer;

        if (typeof options.body === 'object') {
          bodyData = JSON.stringify(options.body);
        } else {
          bodyData = options.body;
        }

        req.write(bodyData);
      }

      req.end();
    });
  }

  private processResponseData(buffer: Buffer, responseType: string): any {
    switch (responseType) {
      case 'json':
        try {
          return JSON.parse(buffer.toString('utf8'));
        } catch (error) {
          return { raw: buffer.toString('utf8'), parseError: error.message };
        }
      case 'text':
        return buffer.toString('utf8');
      case 'buffer':
        return buffer;
      default:
        return buffer.toString('utf8');
    }
  }

  private shouldRetry(error: any, params: OperationConfig): boolean {
    // Retry on network errors
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Check if error has status code and if it's in retry list
    if (error.statusCode && params.retryStatusCodes.includes(error.statusCode)) {
      return true;
    }

    return false;
  }

  private getAcceptHeader(responseType: string): string {
    switch (responseType) {
      case 'json':
        return 'application/json';
      case 'text':
        return 'text/plain';
      case 'buffer':
        return 'application/octet-stream';
      default:
        return '*/*';
    }
  }
}

/**
 * API Client Operation - Specialized client for API interactions
 */
export class APIClientOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'APIClientOperation';
    this.description = 'Specialized client for API interactions with rate limiting and caching';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['api-client', 'service-communication'];
    this.supportedContainers = ['web-service', 'api-service', 'any'];
    this.capabilities = ['api-management', 'rate-limiting', 'response-caching'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'medium'
    };

    this.requiredParameters = ['baseUrl'];
    this.optionalParameters = {
      endpoints: {},
      defaultHeaders: {},
      authentication: null,
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000
      },
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000
      },
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      defaultResponseFormat: 'json',
      validateStatus: true,
      transformRequest: null,
      transformResponse: null,
      interceptors: [],
      logging: true
    };
  }

  private requestHistory: Array<{ timestamp: number; endpoint: string }> = [];
  private responseCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting API client operation', {
      baseUrl: finalParams.baseUrl,
      endpoints: Object.keys(finalParams.endpoints || {}),
      params: finalParams
    });

    try {
      // Initialize API client
      const apiClient = this.initializeClient(finalParams);

      // Execute the requested operation
      const result = await this.executeAPICall(apiClient, finalParams);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'API client operation completed', {
        baseUrl: finalParams.baseUrl,
        executionTime
      });

      return {
        success: true,
        result,
        metadata: {
          baseUrl: finalParams.baseUrl,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'API client operation failed', {
        baseUrl: finalParams.baseUrl,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          baseUrl: finalParams.baseUrl,
          executionTime
        }
      };
    }
  }

  private initializeClient(params: OperationConfig): any {
    return {
      baseUrl: params.baseUrl,
      endpoints: params.endpoints || {},
      headers: params.defaultHeaders || {},
      authentication: params.authentication,
      rateLimit: params.rateLimit,
      cache: params.cache,
      timeout: params.timeout,
      retries: params.retries,
      retryDelay: params.retryDelay,
      defaultResponseFormat: params.defaultResponseFormat,
      validateStatus: params.validateStatus,
      transformRequest: params.transformRequest,
      transformResponse: params.transformResponse,
      interceptors: params.interceptors,
      logging: params.logging
    };
  }

  private async executeAPICall(apiClient: any, params: OperationConfig): Promise<any> {
    // This is a simplified API client execution
    // In a real implementation, this would handle multiple API calls and orchestration

    const results: any = {
      endpoints: {},
      cacheStats: {
        hits: 0,
        misses: 0,
        size: this.responseCache.size
      },
      rateLimitStats: {
        requestsThisMinute: this.getRequestsInLastMinute(),
        requestsThisHour: this.getRequestsInLastHour()
      }
    };

    // Execute configured endpoints
    for (const [endpointName, endpointConfig] of Object.entries(params.endpoints || {})) {
      try {
        const endpointResult = await this.executeEndpoint(apiClient, endpointName, endpointConfig);
        results.endpoints[endpointName] = endpointResult;
      } catch (error) {
        this.log('error', `Endpoint execution failed: ${endpointName}`, { error: (error as Error).message });
        results.endpoints[endpointName] = {
          success: false,
          error: (error as Error).message
        };
      }
    }

    return results;
  }

  private async executeEndpoint(apiClient: any, endpointName: string, endpointConfig: any): Promise<any> {
    const cacheKey = `${apiClient.baseUrl}:${endpointName}:${JSON.stringify(endpointConfig)}`;

    // Check cache
    if (apiClient.cache?.enabled) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.log('debug', 'Cache hit for endpoint', { endpointName });
        return {
          ...cached,
          cached: true,
          cacheKey
        };
      }
    }

    // Check rate limit
    this.checkRateLimit(apiClient);

    // Make request
    const url = this.buildUrl(apiClient.baseUrl, endpointConfig.path);
    const requestParams = {
      url,
      method: endpointConfig.method || 'GET',
      headers: { ...apiClient.headers, ...endpointConfig.headers },
      body: endpointConfig.body,
      timeout: apiClient.timeout,
      responseType: endpointConfig.responseFormat || apiClient.defaultResponseFormat,
      auth: apiClient.authentication
    };

    // Apply request transformation
    if (apiClient.transformRequest) {
      requestParams.body = apiClient.transformRequest(requestParams.body);
    }

    const response = await this.makeAPIRequest(requestParams);

    // Apply response transformation
    let responseData = response.data;
    if (apiClient.transformResponse) {
      responseData = apiClient.transformResponse(responseData);
    }

    const result = {
      success: response.statusCode >= 200 && response.statusCode < 300,
      data: responseData,
      statusCode: response.statusCode,
      headers: response.headers,
      cached: false,
      timestamp: Date.now()
    };

    // Cache response
    if (apiClient.cache?.enabled && result.success) {
      this.saveToCache(cacheKey, result, apiClient.cache.ttl);
    }

    return result;
  }

  private async makeAPIRequest(params: any): Promise<any> {
    // Use the HTTP request operation internally
    const httpRequestOp = new HttpRequestOperation();

    const result = await httpRequestOp.execute({} as any, params);

    if (!result.success) {
      throw new Error(result.error || 'API request failed');
    }

    return result.result;
  }

  private buildUrl(baseUrl: string, path: string): string {
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return cleanBaseUrl + cleanPath;
  }

  private checkRateLimit(apiClient: any): void {
    const now = Date.now();
    const requestsThisMinute = this.getRequestsInLastMinute();
    const requestsThisHour = this.getRequestsInLastHour();

    if (requestsThisMinute >= apiClient.rateLimit.requestsPerMinute) {
      throw new Error(`Rate limit exceeded: ${requestsThisMinute} requests in the last minute`);
    }

    if (requestsThisHour >= apiClient.rateLimit.requestsPerHour) {
      throw new Error(`Rate limit exceeded: ${requestsThisHour} requests in the last hour`);
    }
  }

  private getRequestsInLastMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    return this.requestHistory.filter(req => req.timestamp > oneMinuteAgo).length;
  }

  private getRequestsInLastHour(): number {
    const oneHourAgo = Date.now() - 3600000;
    return this.requestHistory.filter(req => req.timestamp > oneHourAgo).length;
  }

  private getFromCache(key: string): any {
    const cached = this.responseCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    if (cached) {
      this.responseCache.delete(key);
    }
    return null;
  }

  private saveToCache(key: string, data: any, ttl: number): void {
    // Evict oldest entries if cache is full
    if (this.responseCache.size >= 1000) {
      const oldestKey = this.responseCache.keys().next().value;
      this.responseCache.delete(oldestKey);
    }

    this.responseCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
}

/**
 * WebSocket Operation - Handle WebSocket communication
 */
export class WebSocketOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'WebSocketOperation';
    this.description = 'Handle WebSocket communication for real-time data';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['websocket', 'real-time-communication'];
    this.supportedContainers = ['web-service', 'api-service', 'any'];
    this.capabilities = ['real-time-communication', 'event-streaming', 'bidirectional'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'medium'
    };

    this.requiredParameters = ['url'];
    this.optionalParameters = {
      protocols: [],
      headers: {},
      timeout: 10000,
      reconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeat: {
        enabled: true,
        interval: 30000,
        message: 'ping'
      },
      binaryType: 'arraybuffer',
      maxMessageSize: 1048576, // 1MB
      autoClose: true,
      idleTimeout: 300000, // 5 minutes
      onOpen: null,
      onMessage: null,
      onClose: null,
      onError: null
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting WebSocket operation', {
      url: finalParams.url,
      params: finalParams
    });

    try {
      const result = await this.handleWebSocketConnection(finalParams);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'WebSocket operation completed', {
        url: finalParams.url,
        executionTime
      });

      return {
        success: true,
        result,
        metadata: {
          url: finalParams.url,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'WebSocket operation failed', {
        url: finalParams.url,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          url: finalParams.url,
          executionTime
        }
      };
    }
  }

  private async handleWebSocketConnection(params: OperationConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      // Mock WebSocket implementation
      // In a real implementation, you would use a WebSocket library like 'ws'

      this.log('info', 'WebSocket connection initiated', { url: params.url });

      // Simulate WebSocket connection
      setTimeout(() => {
        const mockResult = {
          connected: true,
          url: params.url,
          connectedAt: new Date().toISOString(),
          readyState: 1, // OPEN
          protocols: params.protocols,
          messagesReceived: 0,
          messagesSent: 0,
          lastMessage: null
        };

        this.log('info', 'WebSocket connection established', { url: params.url });

        // Handle heartbeat
        if (params.heartbeat?.enabled) {
          this.startHeartbeat(params);
        }

        resolve(mockResult);
      }, 1000);
    });
  }

  private startHeartbeat(params: OperationConfig): void {
    this.log('debug', 'WebSocket heartbeat started', { interval: params.heartbeat.interval });

    // Mock heartbeat implementation
    const heartbeatInterval = setInterval(() => {
      this.log('debug', 'WebSocket heartbeat sent');
    }, params.heartbeat.interval);

    // Clear interval when operation completes
    setTimeout(() => {
      clearInterval(heartbeatInterval);
    }, 5000);
  }
}