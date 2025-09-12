/**
 * Qwen Provider Implementation (TypeScript)
 * 支持OAuth 2.0 Device Flow的Qwen Provider - TypeScript版本
 */

import { BaseModule } from 'rcc-basemodule';
import BaseProvider from '../framework/BaseProvider';
import { ErrorHandlingCenter } from 'rcc-errorhandling';
import axios from 'axios';
import crypto from 'crypto';
import open from 'open';
import fs from 'fs';
import path from 'path';
import os from 'os';

// OpenAI Interface imports would be defined in separate TypeScript files
interface OpenAIChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: Array<any>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface QwenProviderConfig {
  name: string;
  endpoint: string;
  tokenStoragePath?: string;
  supportedModels?: Array<any>;
  defaultModel?: string;
  metadata?: {
    auth?: {
      tokenStoragePath?: string;
    };
  };
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  lastRefresh: number;
  provider: string;
}

interface DeviceFlowData {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
  pkceVerifier: string;
}

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

class QwenProvider extends BaseProvider {
  protected endpoint: string;
  private tokenStoragePath: string;
  protected supportedModels: Array<any>;
  protected defaultModel: string;
  private accessToken: string | null;
  private refreshToken: string | null;
  private tokenExpiry: number | null;
    
  // OAuth配置
  private oauthConfig = {
    clientId: 'f0304373b74a44d2b584a3fb70ca9e56',
    deviceCodeUrl: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
    tokenUrl: 'https://chat.qwen.ai/api/v1/oauth2/token',
    scopes: ['openid', 'profile', 'email', 'model.completion']
  };

  constructor(config: QwenProviderConfig) {
    // 准备完整的配置，包括auth配置
    const fullConfig = {
      id: 'provider-' + config.name,
      name: config.name + ' Provider',
      version: '1.0.0',
      type: 'provider',
      ...config,
      metadata: {
        auth: {
          tokenStoragePath: config.tokenStoragePath || path.join(os.homedir(), '.webauto', 'auth', 'qwen-token.json'),
          ...config.metadata?.auth
        }
      }
    };

    super(fullConfig);

    this.endpoint = config.endpoint;
    this.supportedModels = config.supportedModels || this.getDefaultModels();
    this.defaultModel = config.defaultModel || 'qwen3-coder-plus';
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    
    // 使用BaseModule配置属性来管理token存储路径
    this.tokenStoragePath = this.getTokenStoragePathFromConfig();
    
      
    // 初始化时尝试加载保存的token
    this.loadTokens();
  }

  private getDefaultModels(): Array<any> {
    return [
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen 3 Coder Plus',
        description: 'Advanced coding model with enhanced reasoning',
        maxTokens: 8192,
        contextWindow: 32768,
        supportsStreaming: true,
        supportsTools: true
      },
      {
        id: 'qwen3-coder-flash',
        name: 'Qwen 3 Coder Flash', 
        description: 'Fast coding model for quick iterations',
        maxTokens: 4096,
        contextWindow: 16384,
        supportsStreaming: true,
        supportsTools: false
      }
    ];
  }

  // 从配置获取token存储路径
  private getTokenStoragePathFromConfig(): string {
    const config = this.getConfig();
    return config.metadata?.auth?.tokenStoragePath || path.join(os.homedir(), '.webauto', 'auth', 'qwen-token.json');
  }

  // 获取token存储路径
  private getTokenStoragePath(): string {
    return this.tokenStoragePath;
  }

  // 保存tokens到文件
  private saveTokens(fullTokenData?: any): boolean {
    if (!this.accessToken) return false;
    
    const tokenData: TokenData = {
      accessToken: this.accessToken!,
      refreshToken: this.refreshToken!,
      tokenExpiry: this.tokenExpiry!,
      lastRefresh: Date.now(),
      provider: this.getInfo().name
    };

    // 如果有完整的token数据，保存额外字段
    if (fullTokenData) {
      if (fullTokenData.resource_url) {
        (tokenData as any).resource_url = fullTokenData.resource_url;
      }
      if (fullTokenData.email) {
        (tokenData as any).email = fullTokenData.email;
      }
    }

    try {
      const tokenPath = this.getTokenStoragePath();
      const authDir = path.dirname(tokenPath);
      
      // 确保目录存在
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }
      
      fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
      console.log('[QwenProvider] Tokens saved to: ' + tokenPath);
      return true;
    } catch (error) {
      this.errorHandler.handleError({
        error: error as Error,
        source: 'QwenProvider.saveTokens',
        severity: 'high',
        timestamp: Date.now()
      });
      return false;
    }
  }

  // 从文件加载tokens
  private loadTokens(): boolean {
    try {
      const tokenPath = this.getTokenStoragePath();
      
      if (!fs.existsSync(tokenPath)) {
        return false;
      }
      
      const tokenData: TokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      
      this.accessToken = tokenData.accessToken;
      this.refreshToken = tokenData.refreshToken;
      this.tokenExpiry = tokenData.tokenExpiry;
      
      console.log('[QwenProvider] Tokens loaded from: ' + tokenPath);
      return true;
    } catch (error) {
      this.errorHandler.handleError({
        error: error as Error,
        source: 'QwenProvider.loadTokens',
        severity: 'medium',
        timestamp: Date.now()
      });
      return false;
    }
  }

  // 清除保存的tokens
  private clearSavedTokens(): void {
    try {
      const tokenPath = this.getTokenStoragePath();
      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
        console.log('[QwenProvider] Tokens cleared from: ' + tokenPath);
      }
    } catch (error) {
      this.errorHandler.handleError({
        error: error as Error,
        source: 'QwenProvider.clearSavedTokens',
        severity: 'medium',
        timestamp: Date.now()
      });
    }
  }

  // 生成PKCE verifier
  private generatePKCEVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  // 生成PKCE challenge
  private generatePKCEChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  // 检查token是否过期
  private isTokenExpired(): boolean {
    return !this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry;
  }

  // 确保有有效的access token
  private async ensureValidToken(): Promise<void> {
    if (this.isTokenExpired()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('No valid token available. Please authenticate first.');
      }
    }
  }

  // 增强的token验证方法
  private async ensureValidTokenWithRetry(forceRefresh: boolean = false): Promise<void> {
    // 只有在强制刷新或token过期时才处理
    if (forceRefresh || this.isTokenExpired()) {
      if (this.refreshToken) {
        try {
          await this.refreshAccessToken();
          console.log('[QwenProvider] Token auto-refreshed successfully');
        } catch (refreshError) {
          console.log('[QwenProvider] Auto-refresh failed, manual re-authentication required');
          throw new Error('Token refresh failed: ' + (refreshError as Error).message);
        }
      } else {
        throw new Error('No valid token available. Please authenticate first.');
      }
    }
    // 如果token没有过期且不强制刷新，直接使用现有token
  }

  // OAuth Device Flow 初始化
  async initiateDeviceFlow(autoOpen: boolean = true): Promise<DeviceFlowData> {
    try {
      const pkceVerifier = this.generatePKCEVerifier();
      const pkceChallenge = this.generatePKCEChallenge(pkceVerifier);

      // 使用form-data格式，参考CLIProxyAPI实现
      const formData = new URLSearchParams();
      formData.append('client_id', this.oauthConfig.clientId);
      formData.append('scope', this.oauthConfig.scopes.join(' '));
      formData.append('code_challenge', pkceChallenge);
      formData.append('code_challenge_method', 'S256');

      const response = await axios.post(this.oauthConfig.deviceCodeUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      const deviceFlow: DeviceFlowData = {
        deviceCode: response.data.device_code,
        userCode: response.data.user_code,
        verificationUri: response.data.verification_uri,
        verificationUriComplete: response.data.verification_uri_complete,
        expiresIn: response.data.expires_in,
        interval: response.data.interval,
        pkceVerifier
      };

      // 自动打开浏览器进行授权
      if (autoOpen && deviceFlow.verificationUriComplete) {
        console.log('[QwenProvider] Opening browser for OAuth authorization...');
        
        try {
          await open(deviceFlow.verificationUriComplete, { 
            wait: false
          });
          console.log('[QwenProvider] Browser opened successfully!');
        } catch (browserError) {
          this.errorHandler.handleError({
            error: browserError as Error,
            source: 'QwenProvider.initiateDeviceFlow',
            severity: 'medium',
            timestamp: Date.now()
          });
        }
      }

      return deviceFlow;
    } catch (error) {
      this.errorHandler.handleError({
        error: error as Error,
        source: 'QwenProvider.initiateDeviceFlow',
        severity: 'high',
        timestamp: Date.now()
      });
      throw new Error('Failed to initiate device flow: ' + (error as Error).message);
    }
  }

  // 等待设备授权
  async waitForDeviceAuthorization(deviceCode: string, pkceVerifier: string, interval: number = 5, maxAttempts: number = 60): Promise<OAuthTokens> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        // 使用form-data格式，参考CLIProxyAPI实现
        const formData = new URLSearchParams();
        formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
        formData.append('client_id', this.oauthConfig.clientId);
        formData.append('device_code', deviceCode);
        formData.append('code_verifier', pkceVerifier);

        const response = await axios.post(this.oauthConfig.tokenUrl, formData.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        });

        // 成功获取token
        this.accessToken = response.data.access_token;
        this.refreshToken = response.data.refresh_token;
        this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

        // 保存tokens到文件
        this.saveTokens();

        return {
          accessToken: this.accessToken!,
          refreshToken: this.refreshToken!,
          expiresIn: response.data.expires_in,
          tokenType: response.data.token_type,
          scope: response.data.scope
        };
      } catch (error) {
        if ((error as any).response?.data?.error === 'authorization_pending') {
          // 授权尚未完成，继续等待
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
          attempts++;
          continue;
        } else if ((error as any).response?.data?.error === 'slow_down') {
          // 请求太频繁，增加间隔时间
          interval += 2;
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
          attempts++;
          continue;
        } else {
          this.errorHandler.handleError({
            error: error as Error,
            source: 'QwenProvider.waitForDeviceAuthorization',
            severity: 'high',
            timestamp: Date.now()
          });
          throw new Error('Device authorization failed: ' + ((error as any).response?.data?.error_description || (error as Error).message));
        }
      }
    }

    throw new Error('Device authorization timeout');
  }

  // 刷新access token
  private async refreshAccessToken(): Promise<OAuthTokens> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      // 使用form-data格式，参考CLIProxyAPI实现
      const formData = new URLSearchParams();
      formData.append('grant_type', 'refresh_token');
      formData.append('client_id', this.oauthConfig.clientId);
      formData.append('refresh_token', this.refreshToken);

      const response = await axios.post(this.oauthConfig.tokenUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      // 保存完整的token信息，包括resource_url
      this.saveTokens(response.data);

      return {
        accessToken: this.accessToken!,
        refreshToken: this.refreshToken!,
        expiresIn: response.data.expires_in,
        tokenType: 'Bearer',
        scope: this.oauthConfig.scopes.join(' ')
      };
    } catch (error) {
      this.errorHandler.handleError({
        error: error as Error,
        source: 'QwenProvider.refreshAccessToken',
        severity: 'high',
        timestamp: Date.now()
      });
      throw new Error('Failed to refresh token: ' + (error as Error).message);
    }
  }

  // 主要的chat实现 - 增强版自动刷新和失败自动认证
  async executeChat(providerRequest: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        // 确保有有效token
        await this.ensureValidTokenWithRetry(retryCount > 0);
        
        // 转换OpenAI格式到Qwen格式
        const qwenRequest = this.convertToQwenFormat(providerRequest);

        const response = await axios.post(this.endpoint + '/chat/completions', qwenRequest, {
          headers: {
            'Authorization': 'Bearer ' + this.accessToken,
            'Content-Type': 'application/json'
          }
        });

        // 转换Qwen响应到标准格式
        return this.convertQwenResponse(response.data);
        
      } catch (error: any) {
        retryCount++;
        
        // 401错误且还有重试机会
        if (error.response?.status === 401 && retryCount <= maxRetries) {
          console.log(`[QwenProvider] Authentication failed (attempt ${retryCount}/${maxRetries + 1}), trying to refresh...`);
          
          if (retryCount === 1) {
            // 第一次尝试：刷新token
            try {
              await this.refreshAccessToken();
              console.log('[QwenProvider] Token refreshed successfully');
              continue;
            } catch (refreshError) {
              console.log('[QwenProvider] Token refresh failed, attempting full re-authentication...');
            }
          }
          
          if (retryCount === 2) {
            // 第二次尝试：完整重新认证
            try {
              console.log('[QwenProvider] Starting automatic re-authentication...');
              const authResult = await this.authenticate(true, { 
                interval: 10, 
                maxAttempts: 30  // 5分钟
              });
              
              if (authResult.success) {
                console.log('[QwenProvider] Automatic re-authentication successful');
                continue;
              } else {
                console.log('[QwenProvider] Automatic re-authentication failed');
                throw new Error('Automatic re-authentication failed: ' + authResult.error);
              }
            } catch (authError) {
              console.log('[QwenProvider] Automatic re-authentication error:', authError.message);
              throw new Error('Re-authentication failed: ' + (authError as Error).message);
            }
          }
        }
        
        // 其他错误或重试用完
        this.errorHandler.handleError({
          error: error as Error,
          source: 'QwenProvider.executeChat',
          severity: 'high',
          timestamp: Date.now()
        });
        throw new Error('Qwen API error: ' + error.message);
      }
    }
    
    throw new Error('Maximum retry attempts exceeded');
  }

  // 流式chat实现 - 增强版自动刷新和失败自动认证
  async *executeStreamChat(providerRequest: OpenAIChatRequest): AsyncGenerator<OpenAIChatResponse> {
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        // 确保有有效token
        await this.ensureValidTokenWithRetry(retryCount > 0);
        
        const qwenRequest = this.convertToQwenFormat({ ...providerRequest, stream: true });

        const response = await axios.post(this.endpoint + '/chat/completions', qwenRequest, {
          headers: {
            'Authorization': 'Bearer ' + this.accessToken,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        });

        const stream = response.data;
        let buffer = '';

        for await (const chunk of stream) {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留未完成的行

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                yield this.convertQwenResponse(parsed);
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
        return; // 成功完成，退出重试循环
        
      } catch (error: any) {
        retryCount++;
        
        // 401错误且还有重试机会
        if (error.response?.status === 401 && retryCount <= maxRetries) {
          console.log(`[QwenProvider] Streaming authentication failed (attempt ${retryCount}/${maxRetries + 1})`);
          
          if (retryCount === 1) {
            // 第一次尝试：刷新token
            try {
              await this.refreshAccessToken();
              console.log('[QwenProvider] Stream token refreshed successfully');
              continue;
            } catch (refreshError) {
              console.log('[QwenProvider] Stream token refresh failed, attempting full re-authentication...');
            }
          }
          
          if (retryCount === 2) {
            // 第二次尝试：完整重新认证
            try {
              console.log('[QwenProvider] Starting stream automatic re-authentication...');
              const authResult = await this.authenticate(true, { 
                interval: 10, 
                maxAttempts: 30  // 5分钟
              });
              
              if (authResult.success) {
                console.log('[QwenProvider] Stream automatic re-authentication successful');
                continue;
              } else {
                console.log('[QwenProvider] Stream automatic re-authentication failed');
                throw new Error('Stream re-authentication failed: ' + authResult.error);
              }
            } catch (authError) {
              console.log('[QwenProvider] Stream automatic re-authentication error:', authError.message);
              throw new Error('Stream re-authentication failed: ' + (authError as Error).message);
            }
          }
        }
        
        // 其他错误或重试用完
        this.errorHandler.handleError({
          error: error as Error,
          source: 'QwenProvider.executeStreamChat',
          severity: 'high',
          timestamp: Date.now()
        });
        throw new Error('Qwen streaming error: ' + error.message);
      }
    }
    
    throw new Error('Maximum stream retry attempts exceeded');
  }

  // 转换OpenAI请求到Qwen格式
  private convertToQwenFormat(openaiRequest: OpenAIChatRequest): any {
    const qwenRequest: any = {
      model: openaiRequest.model || this.defaultModel,
      messages: openaiRequest.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      stream: openaiRequest.stream || false
    };

    // 添加可选参数
    if (openaiRequest.temperature !== undefined) {
      qwenRequest.temperature = openaiRequest.temperature;
    }
    if (openaiRequest.top_p !== undefined) {
      qwenRequest.top_p = openaiRequest.top_p;
    }
    if (openaiRequest.max_tokens !== undefined) {
      qwenRequest.max_tokens = openaiRequest.max_tokens;
    }

    // 工具调用支持
    if (openaiRequest.tools && this.supportsTools(openaiRequest.model)) {
      qwenRequest.tools = openaiRequest.tools;
    }

    return qwenRequest;
  }

  // 转换Qwen响应到标准格式
  private convertQwenResponse(qwenResponse: any): OpenAIChatResponse {
    return {
      id: qwenResponse.id || 'qwen_' + Date.now(),
      object: qwenResponse.object || 'chat.completion',
      created: qwenResponse.created || Date.now(),
      model: qwenResponse.model || this.defaultModel,
      choices: qwenResponse.choices?.map((choice: any) => ({
        index: choice.index || 0,
        message: {
          role: choice.message?.role || 'assistant',
          content: choice.message?.content || '',
          tool_calls: choice.message?.tool_calls
        },
        finish_reason: choice.finish_reason || 'stop'
      })) || [],
      usage: qwenResponse.usage ? {
        prompt_tokens: qwenResponse.usage.prompt_tokens,
        completion_tokens: qwenResponse.usage.completion_tokens,
        total_tokens: qwenResponse.usage.total_tokens
      } : undefined
    };
  }

  // 检查模型是否支持工具调用
  private supportsTools(model: string): boolean {
    const modelInfo = this.supportedModels.find(m => m.id === model);
    return modelInfo?.supportsTools || false;
  }

  // 获取Provider信息
  getInfo(): any {
    const baseInfo = super.getInfo();
    return {
      ...baseInfo,
      name: baseInfo.name.replace(' Provider', ''),
      endpoint: this.endpoint,
      supportedModels: this.supportedModels,
      defaultModel: this.defaultModel,
      capabilities: this.getCapabilities(),
      authentication: {
        type: 'oauth2',
        flow: 'device_code',
        status: this.accessToken ? 'authenticated' : 'not_authenticated'
      }
    };
  }

  // 获取能力
  getCapabilities(): any {
    return {
      streaming: true,
      tools: true,
      vision: false,
      jsonMode: true,
      oauth: true
    };
  }

  // 健康检查
  async healthCheck(): Promise<any> {
    try {
      if (this.isTokenExpired()) {
        return {
          status: 'warning',
          provider: this.getInfo().name,
          message: 'Token expired, needs re-authentication',
          timestamp: Date.now()
        };
      }

      // 测试API连接
      await this.ensureValidToken();
      const testResponse = await axios.get(this.endpoint + '/models', {
        headers: {
          'Authorization': 'Bearer ' + this.accessToken
        }
      });

      return {
        status: 'healthy',
        provider: this.getInfo().name,
        timestamp: Date.now(),
        models: testResponse.data?.data?.length || 0
      };
    } catch (error) {
      this.errorHandler.handleError({
        error: error as Error,
        source: 'QwenProvider.healthCheck',
        severity: 'medium',
        timestamp: Date.now()
      });
      return {
        status: 'unhealthy',
        provider: this.getInfo().name,
        error: (error as Error).message,
        timestamp: Date.now()
      };
    }
  }

  // 获取模型列表
  async getModels(): Promise<any[]> {
    try {
      await this.ensureValidToken();
      const response = await axios.get(this.endpoint + '/models', {
        headers: {
          'Authorization': 'Bearer ' + this.accessToken
        }
      });

      return response.data.data || [];
    } catch (error) {
      // 如果API失败，返回本地配置的模型
      return this.supportedModels;
    }
  }

  // 完整的OAuth认证流程（包括自动打开浏览器和等待授权）
  async authenticate(autoOpen: boolean = true, options: any = {}): Promise<any> {
    console.log('[QwenProvider] Starting OAuth authentication flow...');
    
    try {
      // 初始化设备流程
      const deviceFlow = await this.initiateDeviceFlow(autoOpen);
      
      // 等待用户授权
      const tokens = await this.waitForDeviceAuthorization(
        deviceFlow.deviceCode,
        deviceFlow.pkceVerifier,
        options.interval || deviceFlow.interval,
        options.maxAttempts || Math.floor(deviceFlow.expiresIn / (options.interval || deviceFlow.interval))
      );
      
      console.log('[QwenProvider] Authentication completed successfully');
      
      return {
        success: true,
        tokens,
        provider: this.getInfo().name,
        timestamp: Date.now()
      };
      
    } catch (error) {
      this.errorHandler.handleError({
        error: error as Error,
        source: 'QwenProvider.authenticate',
        severity: 'high',
        timestamp: Date.now()
      });
      return {
        success: false,
        error: (error as Error).message,
        provider: this.getInfo().name,
        timestamp: Date.now()
      };
    }
  }
}

export default QwenProvider;