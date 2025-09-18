/**
 * iFlow Provider Implementation (TypeScript)
 * 使用iflow现有OAuth凭据文件的iFlow Provider - TypeScript版本
 */

import { BaseModule } from 'rcc-basemodule';
import BaseProvider from '../framework/BaseProvider';
import { ErrorHandlingCenter } from 'rcc-errorhandling';
import axios from 'axios';
import * as crypto from 'crypto';
import open from 'open';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<any>;
    };
    finish_reason: string | null;
  }>;
}

interface IFlowOAuthCredentials {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
  apiKey?: string;
}

interface IFlowConfig {
  name?: string;
  endpoint: string;
  model: string;
  supportedModels?: string[];
  credentialsPath?: string;
  authMode?: 'oauth' | 'apikey';
  apiKey?: string;
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

class IFlowProvider extends BaseProvider {
  private credentialsPath: string;
  private accessToken: string = '';
  private refreshToken: string = '';
  private tokenExpiry: number = 0;
  private authMode: 'oauth' | 'apikey';
  private apiKey: string = '';
  
  // OAuth configuration for iFlow
  private oauthConfig = {
    clientId: '10009311001',
    clientSecret: '4Z3YjXycVsQvyGF1etiNlIBB4RsqSDtW',
    authUrl: 'https://iflow.cn/oauth',
    tokenUrl: 'https://iflow.cn/oauth/token',
    deviceCodeUrl: 'https://iflow.cn/oauth/device/code',
    scopes: ['openid', 'profile', 'api']
  };
  
  constructor(config?: Partial<IFlowConfig>) {
    const defaultConfig: IFlowConfig = {
      name: 'iflow',
      endpoint: 'https://apis.iflow.cn/v1',
      model: 'qwen3-coder-plus',
      supportedModels: ['qwen3-coder-plus', 'qwen-turbo', 'qwen-max'],
      authMode: 'oauth', // 默认使用OAuth认证
      credentialsPath: path.join(os.homedir(), '.iflow', 'oauth_creds.json') // 默认共享iflow凭据文件
    };
    
    const finalConfig = { ...defaultConfig, ...config };
    
    super({
      name: finalConfig.name || 'iflow',
      endpoint: finalConfig.endpoint,
      supportedModels: finalConfig.supportedModels,
      defaultModel: finalConfig.model
    });
    
    this.authMode = finalConfig.authMode || 'oauth';
    this.credentialsPath = finalConfig.credentialsPath || path.join(os.homedir(), '.iflow', 'oauth_creds.json');
    this.apiKey = finalConfig.apiKey || '';
    
    this.log(`iFlow Provider initialized (auth mode: ${this.authMode})`);
  }

  /**
   * 重写能力获取方法
   */
  protected getCapabilities() {
    return {
      streaming: true,
      tools: true,
      vision: false,
      jsonMode: true
    };
  }

  /**
   * 检查Token是否有效
   */
  private isTokenValid(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiry;
  }

  /**
   * 从iflow凭据文件加载访问令牌 (OAuth模式)
   */
  private async loadAccessToken(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.credentialsPath)) {
        this.log('iFlow OAuth credentials file not found');
        return false;
      }

      const credentialsData = fs.readFileSync(this.credentialsPath, 'utf8');
      const credentials: IFlowOAuthCredentials = JSON.parse(credentialsData);

      if (credentials.access_token && credentials.expiry_date) {
        // 检查token是否过期
        if (Date.now() < credentials.expiry_date) {
          this.accessToken = credentials.access_token;
          this.refreshToken = credentials.refresh_token || '';
          this.tokenExpiry = credentials.expiry_date;
          
          // 同时加载apiKey（如果存在），用于工具调用
          if (credentials.apiKey) {
            this.apiKey = credentials.apiKey;
            this.log('Loaded iFlow access token and API key from shared credentials');
          } else {
            this.log('Loaded iFlow access token from shared credentials (no API key for tool calling)');
          }
          
          return true;
        } else {
          this.log('iFlow access token expired');
        }
      }
    } catch (error) {
      this.log(`Error loading iFlow credentials: ${error}`);
    }
    return false;
  }

  /**
   * 从凭据文件加载API密钥 (API Key模式)
   */
  private async loadApiKey(): Promise<boolean> {
    try {
      // 优先使用配置的API key
      if (this.apiKey) {
        this.log('Using configured API key');
        return true;
      }

      // 尝试从iflow凭据文件加载API key
      if (fs.existsSync(this.credentialsPath)) {
        const credentialsData = fs.readFileSync(this.credentialsPath, 'utf8');
        const credentials: IFlowOAuthCredentials = JSON.parse(credentialsData);

        if (credentials.apiKey) {
          this.apiKey = credentials.apiKey;
          this.log('Loaded API key from shared credentials');
          return true;
        }
      }

      this.log('No API key found in configuration or credentials file');
      return false;
    } catch (error) {
      this.log(`Error loading API key: ${error}`);
      return false;
    }
  }

  /**
   * 确保有效的认证凭据
   */
  private async ensureValidAuth(): Promise<void> {
    if (this.authMode === 'oauth') {
      if (!this.accessToken || !this.isTokenValid()) {
        const loaded = await this.loadAccessToken();
        if (!loaded) {
          throw new Error('无法加载有效的iFlow访问令牌。请确保iflow已登录并且凭证文件有效。');
        }
      }
    } else if (this.authMode === 'apikey') {
      if (!this.apiKey) {
        const loaded = await this.loadApiKey();
        if (!loaded) {
          throw new Error('无法加载有效的API密钥。请在配置中提供apiKey或确保iflow凭据文件包含apiKey。');
        }
      }
    }
  }

  /**
   * 获取认证头
   */
  private getAuthHeaders(): Record<string, string> {
    if (this.authMode === 'oauth') {
      // 优先使用apiKey（如果存在），因为工具调用需要apiKey认证
      if (this.apiKey) {
        this.log('Using apiKey from OAuth credentials for tool calling support');
        return {
          'Authorization': `Bearer ${this.apiKey}`
        };
      }
      return {
        'Authorization': `Bearer ${this.accessToken}`
      };
    } else if (this.authMode === 'apikey') {
      return {
        'Authorization': `Bearer ${this.apiKey}`
      };
    }
    return {};
  }

  /**
   * 将OpenAI请求转换为iFlow请求格式
   */
  private convertToIFlowRequest(openaiRequest: OpenAIChatRequest): any {
    const iflowRequest: any = {
      model: openaiRequest.model || this.defaultModel,
      messages: openaiRequest.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };

    // 添加可选参数
    if (openaiRequest.temperature !== undefined) {
      iflowRequest.temperature = openaiRequest.temperature;
    }
    if (openaiRequest.top_p !== undefined) {
      iflowRequest.top_p = openaiRequest.top_p;
    }
    if (openaiRequest.max_tokens !== undefined) {
      iflowRequest.max_tokens = openaiRequest.max_tokens;
    }

    // 添加工具调用支持
    if (openaiRequest.tools && openaiRequest.tools.length > 0) {
      iflowRequest.tools = openaiRequest.tools.map(tool => {
        if (tool.type === 'function' && tool.function) {
          return {
            ...tool,
            function: {
              ...tool.function,
              // 添加iFlow API必需的strict字段
              ...(tool.function as any).strict !== undefined ? { strict: (tool.function as any).strict } : { strict: false }
            }
          };
        }
        return tool;
      });
    }

    return iflowRequest;
  }

  /**
   * 将iFlow响应转换为OpenAI响应格式
   */
  private convertToOpenAIResponse(iflowResponse: any): OpenAIChatResponse {
    return {
      id: iflowResponse.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: iflowResponse.model || this.defaultModel,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: iflowResponse.choices?.[0]?.message?.content || '',
          tool_calls: iflowResponse.choices?.[0]?.message?.tool_calls
        },
        finish_reason: iflowResponse.choices?.[0]?.finish_reason || 'stop'
      }],
      usage: iflowResponse.usage
    };
  }

  /**
   * 执行聊天请求
   */
  async executeChat(providerRequest: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        // 确保有效的认证凭据，支持自动刷新
        if (this.authMode === 'oauth') {
          await this.ensureValidTokenWithRetry(retryCount > 0);
        } else {
          await this.ensureValidAuth();
        }

        const iflowRequest = this.convertToIFlowRequest(providerRequest);

        this.log(`Sending chat request to iFlow API (attempt ${retryCount + 1})`);

        const authHeaders = this.getAuthHeaders();
        const response = await axios.post(`${this.endpoint}/chat/completions`, iflowRequest, {
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30秒超时
        });

        return this.convertToOpenAIResponse(response.data);
        
      } catch (error: any) {
        this.log(`Chat request failed (attempt ${retryCount + 1}): ${error.response?.data?.error || error.message}`);
        
        retryCount++;
        
        // 如果是认证错误且还有重试机会
        if (error.response?.status === 401 && retryCount <= maxRetries) {
          this.log('Authentication error, attempting token refresh and retry...');
          
          if (this.authMode === 'oauth') {
            // 清除当前token强制重新加载
            this.accessToken = '';
            this.refreshToken = '';
          } else {
            this.apiKey = '';
          }
          continue; // 重试
        }
        
        throw error;
      }
    }
    
    throw new Error('Max retries exceeded for chat request');
  }

  /**
   * 执行流式聊天请求
   */
  async *executeStreamChat(providerRequest: OpenAIChatRequest): AsyncGenerator<any, void, unknown> {
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        // 确保有效的认证凭据，支持自动刷新
        if (this.authMode === 'oauth') {
          await this.ensureValidTokenWithRetry(retryCount > 0);
        } else {
          await this.ensureValidAuth();
        }

        const iflowRequest = this.convertToIFlowRequest(providerRequest);
        iflowRequest.stream = true;

        this.log(`Sending stream chat request to iFlow API (attempt ${retryCount + 1})`);

        const authHeaders = this.getAuthHeaders();
        const response = await axios.post(`${this.endpoint}/chat/completions`, iflowRequest, {
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          responseType: 'stream',
          timeout: 60000 // 60秒超时
        });

        for await (const chunk of this.createStreamIterator(response.data)) {
          yield chunk;
        }
        return; // 成功完成，退出重试循环
        
      } catch (error: any) {
        this.log(`Stream chat request failed (attempt ${retryCount + 1}): ${error.response?.data?.error || error.message}`);
        
        retryCount++;
        
        // 如果是认证错误且还有重试机会
        if (error.response?.status === 401 && retryCount <= maxRetries) {
          this.log('Authentication error, attempting token refresh and retry...');
          
          if (this.authMode === 'oauth') {
            // 清除当前token强制重新加载
            this.accessToken = '';
            this.refreshToken = '';
          } else {
            this.apiKey = '';
          }
          continue; // 重试
        }
        
        throw error;
      }
    }
    
    throw new Error('Max retries exceeded for stream chat request');
  }

  /**
   * 创建流式迭代器
   */
  private async* createStreamIterator(stream: any): AsyncIterable<OpenAIStreamChunk> {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          break;
        }

        try {
          const parsed = JSON.parse(data);
          yield this.convertStreamChunk(parsed);
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  /**
   * 转换流式响应块
   */
  private convertStreamChunk(chunk: any): OpenAIStreamChunk {
    return {
      id: chunk.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: chunk.model || this.defaultModel,
      choices: [{
        index: 0,
        delta: {
          role: chunk.choices?.[0]?.delta?.role,
          content: chunk.choices?.[0]?.delta?.content,
          tool_calls: chunk.choices?.[0]?.delta?.tool_calls
        },
        finish_reason: chunk.choices?.[0]?.finish_reason || null
      }]
    };
  }

  /**
   * OAuth测试工具方法
   */

  /**
   * 生成PKCE验证码
   */
  private generatePKCEVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * 生成PKCE挑战码
   */
  private generatePKCEChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * 启动设备OAuth流程
   */
  async initiateDeviceFlow(autoOpen: boolean = true): Promise<DeviceFlowData> {
    try {
      this.log('Starting iFlow OAuth device flow');
      
      const pkceVerifier = this.generatePKCEVerifier();
      const pkceChallenge = this.generatePKCEChallenge(pkceVerifier);
      
      // 使用form-data格式请求设备码
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

      const responseData = response.data as any;
      
      const deviceFlow: DeviceFlowData = {
        deviceCode: responseData.device_code,
        userCode: responseData.user_code,
        verificationUri: responseData.verification_uri,
        verificationUriComplete: responseData.verification_uri_complete,
        expiresIn: responseData.expires_in,
        interval: responseData.interval,
        pkceVerifier: pkceVerifier
      };
      
      this.log(`Device flow initiated - User code: ${deviceFlow.userCode}`);
      
      // 自动打开浏览器进行授权
      if (autoOpen && deviceFlow.verificationUriComplete) {
        this.log('Opening browser for authorization...');
        await open(deviceFlow.verificationUriComplete);
      }
      
      return deviceFlow;
      
    } catch (error: any) {
      this.log(`Failed to initiate device flow: ${error.response?.data?.error || error.message}`);
      throw error;
    }
  }

  /**
   * 等待设备授权完成
   */
  async waitForDeviceAuthorization(
    deviceCode: string, 
    pkceVerifier: string, 
    interval: number = 5, 
    maxAttempts: number = 60
  ): Promise<OAuthTokens> {
    try {
      this.log(`Waiting for device authorization (device code: ${deviceCode})`);
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
        
        try {
          const formData = new URLSearchParams();
          formData.append('client_id', this.oauthConfig.clientId);
          formData.append('client_secret', this.oauthConfig.clientSecret);
          formData.append('device_code', deviceCode);
          formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
          formData.append('code_verifier', pkceVerifier);
          
          const response = await axios.post(this.oauthConfig.tokenUrl, formData.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            }
          });

          const tokenData = response.data as any;

          const tokens: OAuthTokens = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            expiresIn: tokenData.expires_in,
            tokenType: tokenData.token_type,
            scope: tokenData.scope
          };
          
          this.log('Device authorization completed successfully');
          
          // 自动保存token到凭证文件
          await this.saveOAuthTokens(tokens);
          
          return tokens;
          
        } catch (error: any) {
          if (error.response?.data?.error === 'authorization_pending') {
            this.log(`Authorization pending... (attempt ${attempt}/${maxAttempts})`);
            continue;
          } else if (error.response?.data?.error === 'slow_down') {
            this.log(`Slow down requested... (attempt ${attempt}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
            continue;
          } else {
            this.log(`Authorization failed: ${error.response?.data?.error || error.message}`);
            throw error;
          }
        }
      }
      
      throw new Error('Device authorization timed out');
      
    } catch (error: any) {
      this.log(`Failed to wait for device authorization: ${error.message}`);
      throw error;
    }
  }

  /**
   * 保存OAuth令牌到凭证文件
   */
  private async saveOAuthTokens(tokens: OAuthTokens): Promise<void> {
    try {
      const credentialsDir = path.dirname(this.credentialsPath);
      if (!fs.existsSync(credentialsDir)) {
        fs.mkdirSync(credentialsDir, { recursive: true });
      }
      
      const credentials: IFlowOAuthCredentials = {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: Date.now() + (tokens.expiresIn * 1000),
        token_type: tokens.tokenType,
        scope: tokens.scope
      };
      
      fs.writeFileSync(this.credentialsPath, JSON.stringify(credentials, null, 2));
      this.log(`OAuth tokens saved to ${this.credentialsPath}`);
      
      // 更新内存中的token
      this.accessToken = tokens.accessToken;
      this.refreshToken = tokens.refreshToken;
      this.tokenExpiry = credentials.expiry_date;
      
    } catch (error: any) {
      this.log(`Failed to save OAuth tokens: ${error.message}`);
      throw error;
    }
  }

  /**
   * 刷新访问令牌
   */
  private async refreshAccessToken(): Promise<OAuthTokens> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available for token refresh');
    }
    
    try {
      this.log('Attempting to refresh access token');
      
      const formData = new URLSearchParams();
      formData.append('grant_type', 'refresh_token');
      formData.append('client_id', this.oauthConfig.clientId);
      formData.append('client_secret', this.oauthConfig.clientSecret);
      formData.append('refresh_token', this.refreshToken);
      
      const response = await axios.post(this.oauthConfig.tokenUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      const refreshData = response.data as any;

      const tokens: OAuthTokens = {
        accessToken: refreshData.access_token,
        refreshToken: refreshData.refresh_token || this.refreshToken,
        expiresIn: refreshData.expires_in,
        tokenType: refreshData.token_type,
        scope: refreshData.scope
      };
      
      // 保存刷新后的令牌
      await this.saveOAuthTokens(tokens);
      
      this.log('Access token refreshed successfully');
      return tokens;
      
    } catch (error: any) {
      this.log(`Failed to refresh access token: ${error.response?.data?.error || error.message}`);
      
      // 如果refresh token也失效了，清除所有token
      if (error.response?.status === 400 || error.response?.data?.error === 'invalid_grant') {
        this.log('Refresh token expired or invalid, clearing tokens');
        this.accessToken = '';
        this.refreshToken = '';
        this.tokenExpiry = 0;
      }
      
      throw error;
    }
  }

  /**
   * 确保有效令牌（带自动刷新）
   */
  private async ensureValidTokenWithRetry(forceRefresh: boolean = false): Promise<void> {
    if (this.authMode !== 'oauth') {
      return;
    }
    
    // 检查是否需要刷新
    const needsRefresh = forceRefresh || !this.isTokenValid();
    
    if (needsRefresh) {
      if (this.refreshToken) {
        try {
          await this.refreshAccessToken();
          this.log('Token auto-refreshed successfully');
        } catch (refreshError) {
          this.log('Auto-refresh failed, manual re-authentication required');
          throw new Error('Token refresh failed: ' + (refreshError as Error).message);
        }
      } else {
        throw new Error('No valid token available. Please authenticate first.');
      }
    }
  }

  /**
   * 重建OAuth认证（强制重新认证）
   */
  async rebuildOAuthAuthentication(autoOpen: boolean = true): Promise<OAuthTokens> {
    try {
      this.log('Starting OAuth authentication rebuild');
      
      // 清除现有token
      this.accessToken = '';
      this.refreshToken = '';
      this.tokenExpiry = 0;
      
      // 执行完整的OAuth流程
      const tokens = await this.completeOAuthFlow(autoOpen);
      
      this.log('OAuth authentication rebuilt successfully');
      return tokens;
      
    } catch (error: any) {
      this.log(`Failed to rebuild OAuth authentication: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查令牌状态
   */
  async getTokenStatus(): Promise<{
    authMode: 'oauth' | 'apikey';
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    isValid: boolean;
    timeUntilExpiry: number;
    credentialsPath: string;
  }> {
    const now = Date.now();
    const timeUntilExpiry = this.tokenExpiry > 0 ? Math.max(0, this.tokenExpiry - now) / 1000 : 0;
    let isValid = false;
    
    if (this.authMode === 'oauth') {
      isValid = this.isTokenValid();
    } else if (this.authMode === 'apikey') {
      isValid = !!this.apiKey;
    }
    
    return {
      authMode: this.authMode,
      hasAccessToken: !!this.accessToken,
      hasRefreshToken: !!this.refreshToken,
      isValid: !!isValid, // 确保返回布尔值
      timeUntilExpiry,
      credentialsPath: this.credentialsPath
    };
  }

  /**
   * 完整的OAuth认证流程
   */
  async completeOAuthFlow(autoOpen: boolean = true): Promise<OAuthTokens> {
    try {
      this.log('Starting complete OAuth flow');
      
      const deviceFlow = await this.initiateDeviceFlow(autoOpen);
      const tokens = await this.waitForDeviceAuthorization(
        deviceFlow.deviceCode,
        deviceFlow.pkceVerifier,
        deviceFlow.interval,
        Math.ceil(deviceFlow.expiresIn / deviceFlow.interval)
      );
      
      this.log('OAuth flow completed successfully');
      return tokens;
      
    } catch (error: any) {
      this.log(`OAuth flow failed: ${error.message}`);
      throw error;
    }
  }

  
  }

export default IFlowProvider;