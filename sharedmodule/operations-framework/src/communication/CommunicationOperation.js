/**
 * 通信系统操作子基类
 * 处理通信相关的所有操作
 */

import BaseOperation from "./BaseOperation.js"';
import { EventEmitter } from 'events';

export class CommunicationOperation extends BaseOperation {
  constructor(config = {}) {
    super(config);
    this.category = 'communication';
    this.eventEmitter = new EventEmitter();
    this.connections = new Map();
    this.middlewares = [];
    this.interceptors = {
      request: [],
      response: []
    };
    this.defaultTimeout = config.timeout || 10000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * 添加中间件
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    this.middlewares.push(middleware);
    this.logger.debug('Middleware added', { middlewareCount: this.middlewares.length });
  }

  /**
   * 添加请求拦截器
   */
  addRequestInterceptor(interceptor) {
    if (typeof interceptor !== 'function') {
      throw new Error('Request interceptor must be a function');
    }
    this.interceptors.request.push(interceptor);
    this.logger.debug('Request interceptor added', { 
      interceptorCount: this.interceptors.request.length 
    });
  }

  /**
   * 添加响应拦截器
   */
  addResponseInterceptor(interceptor) {
    if (typeof interceptor !== 'function') {
      throw new Error('Response interceptor must be a function');
    }
    this.interceptors.response.push(interceptor);
    this.logger.debug('Response interceptor added', { 
      interceptorCount: this.interceptors.response.length 
    });
  }

  /**
   * 执行中间件链
   */
  async executeMiddlewares(context, next) {
    let index = -1;

    const dispatch = async (i) => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;

      let fn = this.middlewares[i];
      if (i === this.middlewares.length) {
        fn = next;
      }

      if (!fn) {
        return;
      }

      try {
        return await fn(context, dispatch.bind(null, i + 1));
      } catch (error) {
        this.logger.error('Middleware execution failed', { 
          middlewareIndex: i, 
          error: error.message 
        });
        throw error;
      }
    };

    return await dispatch(0);
  }

  /**
   * 执行请求拦截器
   */
  async executeRequestInterceptors(request) {
    let modifiedRequest = request;
    
    for (const interceptor of this.interceptors.request) {
      try {
        modifiedRequest = await interceptor(modifiedRequest);
      } catch (error) {
        this.logger.warn('Request interceptor failed', { error: error.message });
        // 继续执行下一个拦截器
      }
    }
    
    return modifiedRequest;
  }

  /**
   * 执行响应拦截器
   */
  async executeResponseInterceptors(response) {
    let modifiedResponse = response;
    
    for (const interceptor of this.interceptors.response) {
      try {
        modifiedResponse = await interceptor(modifiedResponse);
      } catch (error) {
        this.logger.warn('Response interceptor failed', { error: error.message });
        // 继续执行下一个拦截器
      }
    }
    
    return modifiedResponse;
  }

  /**
   * HTTP请求操作
   */
  async httpRequest(options = {}) {
    const {
      url,
      method = 'GET',
      headers = {},
      body = null,
      timeout = this.defaultTimeout,
      ...fetchOptions
    } = options;

    const requestId = this.generateRequestId();
    
    try {
      // 构建请求配置
      const requestConfig = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        ...fetchOptions
      };

      // 添加请求体
      if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        if (typeof body === 'object') {
          requestConfig.body = JSON.stringify(body);
        } else {
          requestConfig.body = body;
        }
      }

      // 应用请求拦截器
      const interceptedRequest = await this.executeRequestInterceptors({
        requestId,
        url,
        config: requestConfig
      });

      // 发送请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      this.emit('request:start', { requestId, url, method });

      const response = await fetch(url, {
        ...interceptedRequest.config,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 解析响应
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      const result = {
        requestId,
        url,
        method,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        timestamp: Date.now()
      };

      // 应用响应拦截器
      const interceptedResult = await this.executeResponseInterceptors(result);

      this.emit('request:success', { requestId, result: interceptedResult });

      return interceptedResult;
    } catch (error) {
      const errorResult = {
        requestId,
        url,
        method,
        error: error.message,
        timestamp: Date.now()
      };

      this.emit('request:error', { requestId, error: errorResult });
      throw error;
    }
  }

  /**
   * 重试操作
   */
  async retryOperation(operation, maxAttempts = null, delay = null) {
    const maxRetries = maxAttempts || this.retryAttempts;
    const retryDelay = delay || this.retryDelay;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Retry attempt ${attempt}/${maxRetries}`);
        return await operation();
      } catch (error) {
        lastError = error;
        this.logger.warn(`Operation failed (attempt ${attempt}/${maxRetries})`, { 
          error: error.message 
        });

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError;
  }

  /**
   * WebSocket连接
   */
  async connectWebSocket(url, options = {}) {
    const connectionId = this.generateConnectionId();
    
    try {
      // 这里使用模拟的WebSocket连接
      // 实际使用时需要替换为真实的WebSocket客户端
      const mockConnection = this.createMockWebSocketConnection(url, options);
      
      this.connections.set(connectionId, {
        id: connectionId,
        url,
        type: 'websocket',
        connection: mockConnection,
        connectedAt: Date.now(),
        status: 'connected'
      });

      this.emit('websocket:connected', { connectionId, url });

      return {
        connectionId,
        send: (data) => this.sendWebSocketMessage(connectionId, data),
        close: () => this.closeWebSocketConnection(connectionId),
        on: (event, callback) => this.onWebSocketEvent(connectionId, event, callback)
      };
    } catch (error) {
      this.logger.error('WebSocket connection failed', { 
        url, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 创建模拟WebSocket连接
   */
  createMockWebSocketConnection(url, options) {
    return {
      url,
      readyState: 1, // OPEN
      send: (data) => {
        this.logger.debug('WebSocket message sent', { url, data });
        // 模拟接收响应
        setTimeout(() => {
          this.emit('websocket:message', {
            connectionId: this.generateConnectionId(),
            data: `Echo: ${data}`
          });
        }, 100);
      },
      close: () => {
        this.logger.debug('WebSocket connection closed', { url });
      }
    };
  }

  /**
   * 发送WebSocket消息
   */
  async sendWebSocketMessage(connectionId, data) {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.type !== 'websocket') {
      throw new Error(`WebSocket connection ${connectionId} not found`);
    }

    try {
      await connection.connection.send(data);
      this.emit('websocket:message_sent', { connectionId, data });
    } catch (error) {
      this.logger.error('WebSocket message send failed', { 
        connectionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 关闭WebSocket连接
   */
  async closeWebSocketConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.type !== 'websocket') {
      throw new Error(`WebSocket connection ${connectionId} not found`);
    }

    try {
      connection.connection.close();
      this.connections.delete(connectionId);
      this.emit('websocket:disconnected', { connectionId });
    } catch (error) {
      this.logger.error('WebSocket connection close failed', { 
        connectionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 监听WebSocket事件
   */
  onWebSocketEvent(connectionId, event, callback) {
    const eventName = `websocket:${event}`;
    this.eventEmitter.on(eventName, (data) => {
      if (data.connectionId === connectionId) {
        callback(data);
      }
    });
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    const checks = {
      connections: this.connections.size,
      middlewares: this.middlewares.length,
      interceptors: {
        request: this.interceptors.request.length,
        response: this.interceptors.response.length
      },
      timestamp: Date.now()
    };

    try {
      // 执行简单的HTTP健康检查
      await this.httpRequest({
        url: 'https://httpbin.org/get',
        method: 'GET',
        timeout: 5000
      });
      
      return {
        healthy: true,
        ...checks,
        message: 'Communication operation is healthy'
      };
    } catch (error) {
      return {
        healthy: false,
        ...checks,
        error: error.message
      };
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map(conn => ({
        id: conn.id,
        type: conn.type,
        url: conn.url,
        status: conn.status,
        connectedAt: conn.connectedAt
      }))
    };
  }

  /**
   * 生成请求ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成连接ID
   */
  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 事件监听（继承EventEmitter）
   */
  on(event, callback) {
    this.eventEmitter.on(event, callback);
  }

  /**
   * 事件发射（继承EventEmitter）
   */
  emit(event, data) {
    this.eventEmitter.emit(event, data);
  }

  /**
   * 清理资源
   */
  async cleanup() {
    // 关闭所有连接
    for (const [connectionId, connection] of this.connections) {
      try {
        if (connection.type === 'websocket') {
          await this.closeWebSocketConnection(connectionId);
        }
      } catch (error) {
        this.logger.warn('Failed to close connection during cleanup', { 
          connectionId, 
          error: error.message 
        });
      }
    }

    // 清理事件监听器
    this.eventEmitter.removeAllListeners();
    
    // 清理连接映射
    this.connections.clear();

    this.logger.info('Communication operation resources cleaned up');
  }

  /**
   * 获取操作子状态
   */
  getStatus() {
    return {
      ...this.getConnectionStatus(),
      category: this.category,
      middlewares: this.middlewares.length,
      interceptors: this.interceptors,
      config: {
        timeout: this.defaultTimeout,
        retryAttempts: this.retryAttempts,
        retryDelay: this.retryDelay
      }
    };
  }
}

export default CommunicationOperation;