/**
 * Qwen Provider Implementation
 * 支持OAuth 2.0 Device Flow的Qwen Provider
 */

const BaseProvider = require('../framework/BaseProvider');
const { OpenAIInterface } = require('../framework/OpenAIInterface');
const axios = require('axios');
const crypto = require('crypto');
const open = require('open').default;
const fs = require('fs');
const path = require('path');
const os = require('os');

class QwenProvider extends BaseProvider {
  constructor(config = {}) {
    super({
      name: 'qwen',
      endpoint: 'https://portal.qwen.ai/v1',
      ...config
    });

    // OAuth配置
    this.oauthConfig = {
      clientId: 'f0304373b74a44d2b584a3fb70ca9e56',
      deviceCodeUrl: 'https://chat.qwen.ai/api/v1/oauth2/device/code',
      tokenUrl: 'https://chat.qwen.ai/api/v1/oauth2/token',
      scopes: ['openid', 'profile', 'email', 'model.completion']
    };

    // 支持的模型
    this.supportedModels = [
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

    this.defaultModel = 'qwen3-coder-plus';
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    
    // 配置token存储路径
    this.tokenStoragePath = config.tokenStoragePath || path.join(os.homedir(), '.webauto', 'auth', 'qwen-token.json');
    
    // 初始化时尝试加载保存的token
    this.loadTokens();
  }

  // 获取token存储路径
  getTokenStoragePath() {
    return this.tokenStoragePath;
  }

  // 保存tokens到文件
  saveTokens() {
    if (!this.accessToken) return false;
    
    const tokenData = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry,
      lastRefresh: Date.now(),
      provider: this.name
    };

    try {
      const tokenPath = this.getTokenStoragePath();
      const authDir = path.dirname(tokenPath);
      
      // 确保目录存在
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }
      
      fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
      console.log(`💾 Tokens saved to: ${tokenPath}`);
      return true;
    } catch (error) {
      console.error('Failed to save tokens:', error.message);
      return false;
    }
  }

  // 从文件加载tokens
  loadTokens() {
    try {
      const tokenPath = this.getTokenStoragePath();
      
      if (!fs.existsSync(tokenPath)) {
        return false;
      }
      
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      
      this.accessToken = tokenData.accessToken;
      this.refreshToken = tokenData.refreshToken;
      this.tokenExpiry = tokenData.tokenExpiry;
      
      console.log(`📂 Tokens loaded from: ${tokenPath}`);
      return true;
    } catch (error) {
      console.error('Failed to load tokens:', error.message);
      return false;
    }
  }

  // 清除保存的tokens
  clearSavedTokens() {
    try {
      const tokenPath = this.getTokenStoragePath();
      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
        console.log(`🗑️  Tokens cleared from: ${tokenPath}`);
      }
    } catch (error) {
      console.error('Failed to clear tokens:', error.message);
    }
  }

  // OAuth Device Flow 初始化
  async initiateDeviceFlow(autoOpen = true) {
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

      const deviceFlow = {
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
        console.log('🌐 Opening browser for Qwen OAuth authorization...');
        console.log(`📱 User Code: ${deviceFlow.userCode}`);
        
        try {
          // 尝试多种方式打开浏览器
          await open(deviceFlow.verificationUriComplete, { 
            wait: false,
            url: true
          });
          console.log('✅ Browser opened successfully!');
          console.log('⏳ Please complete the authorization in the browser...');
          console.log(`   (If browser didn\'t open, manually visit: ${deviceFlow.verificationUriComplete})`);
        } catch (browserError) {
          console.log('⚠️  Could not open browser automatically:');
          console.log(`   Please manually visit: ${deviceFlow.verificationUriComplete}`);
          console.log(`   User Code: ${deviceFlow.userCode}`);
        }
      }

      return deviceFlow;
    } catch (error) {
      throw new Error(`Failed to initiate device flow: ${error.message}`);
    }
  }

  // 等待设备授权
  async waitForDeviceAuthorization(deviceCode, pkceVerifier, interval = 5, maxAttempts = 60) {
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
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          expiresIn: response.data.expires_in,
          tokenType: response.data.token_type,
          scope: response.data.scope
        };
      } catch (error) {
        if (error.response?.data?.error === 'authorization_pending') {
          // 授权尚未完成，继续等待
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
          attempts++;
          continue;
        } else if (error.response?.data?.error === 'slow_down') {
          // 请求太频繁，增加间隔时间
          interval += 2;
          await new Promise(resolve => setTimeout(resolve, interval * 1000));
          attempts++;
          continue;
        } else {
          throw new Error(`Device authorization failed: ${error.response?.data?.error_description || error.message}`);
        }
      }
    }

    throw new Error('Device authorization timeout');
  }

  // 刷新access token
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(this.oauthConfig.tokenUrl, {
        grant_type: 'refresh_token',
        client_id: this.oauthConfig.clientId,
        refresh_token: this.refreshToken
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      // 保存刷新后的tokens
      this.saveTokens();

      return {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  // 检查token是否过期
  isTokenExpired() {
    return !this.accessToken || !this.tokenExpiry || Date.now() >= this.tokenExpiry;
  }

  // 确保有有效的access token
  async ensureValidToken() {
    if (this.isTokenExpired()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('No valid token available. Please authenticate first.');
      }
    }
  }

  // 主要的chat实现
  async executeChat(providerRequest) {
    await this.ensureValidToken();

    try {
      // 转换OpenAI格式到Qwen格式
      const qwenRequest = this.convertToQwenFormat(providerRequest);

      const response = await axios.post(`${this.endpoint}/chat/completions`, qwenRequest, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // 转换Qwen响应到标准格式
      return this.convertQwenResponse(response.data);
    } catch (error) {
      if (error.response?.status === 401 && this.refreshToken) {
        // Token过期，尝试刷新并重试
        await this.refreshAccessToken();
        return this.executeChat(providerRequest);
      }
      throw new Error(`Qwen API error: ${error.message}`);
    }
  }

  // 流式chat实现
  async *executeStreamChat(providerRequest) {
    await this.ensureValidToken();

    try {
      const qwenRequest = this.convertToQwenFormat({ ...providerRequest, stream: true });

      const response = await axios.post(`${this.endpoint}/chat/completions`, qwenRequest, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 保留未完成的行

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
    } catch (error) {
      if (error.response?.status === 401 && this.refreshToken) {
        // Token过期，尝试刷新并重试
        await this.refreshAccessToken();
        yield* this.executeStreamChat(providerRequest);
      } else {
        throw new Error(`Qwen streaming error: ${error.message}`);
      }
    }
  }

  // 转换OpenAI请求到Qwen格式
  convertToQwenFormat(openaiRequest) {
    const qwenRequest = {
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
  convertQwenResponse(qwenResponse) {
    return {
      id: qwenResponse.id || `qwen_${Date.now()}`,
      object: qwenResponse.object || 'chat.completion',
      created: qwenResponse.created || Date.now(),
      model: qwenResponse.model || this.defaultModel,
      choices: qwenResponse.choices?.map(choice => ({
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
  supportsTools(model) {
    const modelInfo = this.supportedModels.find(m => m.id === model);
    return modelInfo?.supportsTools || false;
  }

  // 生成PKCE verifier
  generatePKCEVerifier() {
    return crypto.randomBytes(32).toString('base64url');
  }

  // 生成PKCE challenge
  generatePKCEChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  // 获取Provider信息
  getInfo() {
    return {
      ...super.getInfo(),
      authentication: {
        type: 'oauth2',
        flow: 'device_code',
        status: this.accessToken ? 'authenticated' : 'not_authenticated'
      },
      models: this.supportedModels
    };
  }

  // 获取能力
  getCapabilities() {
    return {
      streaming: true,
      tools: true,
      vision: false,
      jsonMode: true,
      oauth: true
    };
  }

  // 健康检查
  async healthCheck() {
    try {
      if (this.isTokenExpired()) {
        return {
          status: 'warning',
          provider: this.name,
          message: 'Token expired, needs re-authentication',
          timestamp: new Date().toISOString()
        };
      }

      // 测试API连接
      await this.ensureValidToken();
      const testResponse = await axios.get(`${this.endpoint}/models`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return {
        status: 'healthy',
        provider: this.name,
        timestamp: new Date().toISOString(),
        models: testResponse.data?.data?.length || 0
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: this.name,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // 获取模型列表
  async getModels() {
    try {
      await this.ensureValidToken();
      const response = await axios.get(`${this.endpoint}/models`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      return response.data.data || [];
    } catch (error) {
      // 如果API失败，返回本地配置的模型
      return this.supportedModels;
    }
  }

  // 完整的OAuth认证流程（包括自动打开浏览器和等待授权）
  async authenticate(autoOpen = true, options = {}) {
    console.log('🔐 Starting Qwen OAuth authentication flow...\n');
    
    try {
      // 初始化设备流程
      const deviceFlow = await this.initiateDeviceFlow(autoOpen);
      
      console.log('\n⏳ Waiting for authorization to complete...');
      console.log(`   Timeout: ${deviceFlow.expiresIn} seconds`);
      console.log(`   Polling interval: ${deviceFlow.interval} seconds\n`);
      
      // 等待用户授权
      const tokens = await this.waitForDeviceAuthorization(
        deviceFlow.deviceCode,
        deviceFlow.pkceVerifier,
        options.interval || deviceFlow.interval,
        options.maxAttempts || Math.floor(deviceFlow.expiresIn / (options.interval || deviceFlow.interval))
      );
      
      console.log('\n✅ Authentication completed successfully!');
      console.log(`   Access Token: ${tokens.accessToken.slice(0, 20)}...`);
      console.log(`   Refresh Token: ${tokens.refreshToken ? tokens.refreshToken.slice(0, 20) + '...' : 'N/A'}`);
      console.log(`   Expires in: ${tokens.expiresIn} seconds`);
      
      return {
        success: true,
        tokens,
        provider: this.name,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('\n❌ Authentication failed:', error.message);
      return {
        success: false,
        error: error.message,
        provider: this.name,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = QwenProvider;