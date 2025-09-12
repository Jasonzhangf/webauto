const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * WebAuto配置管理器
 * 管理~/.webauto/config.json配置文件和模型检测
 */
class WebAutoConfigManager {
  constructor() {
    this.configPath = path.join(require('os').homedir(), '.webauto', 'config.json');
    this.config = null;
    this.logDir = path.join(require('os').homedir(), '.webauto', 'logs');
  }

  /**
   * 初始化配置管理器
   */
  async initialize() {
    await this.ensureDirectories();
    await this.loadConfig();
    await this.autoDetectLMStudioModels();
  }

  /**
   * 确保目录存在
   */
  async ensureDirectories() {
    const dirs = [
      path.dirname(this.configPath),
      this.logDir
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
      } else {
        this.config = this.createDefaultConfig();
        await this.saveConfig();
      }
    } catch (error) {
      console.error('加载配置文件失败:', error.message);
      this.config = this.createDefaultConfig();
      await this.saveConfig();
    }
  }

  /**
   * 创建默认配置
   */
  createDefaultConfig() {
    return {
      version: "1.0.0",
      defaults: {
        provider: "iflow",
        model: "qwen3-coder",
        maxTokens: 65536,
        temperature: 0.7,
        timeout: 30000
      },
      providers: {
        iflow: {
          enabled: true,
          name: "iFlow",
          apiEndpoint: "https://apis.iflow.cn/v1/chat/completions",
          apiKey: "your-iflow-api-key-here",
          models: [
            {
              id: "qwen3-coder",
              name: "Qwen3 Coder",
              contextWindow: 262144,
              maxOutput: 65536,
              description: "通义千问3代码模型，支持256k上下文",
              capabilities: ["code", "reasoning", "tool-calling"]
            },
            {
              id: "qwen3-max-preview",
              name: "Qwen3 Max Preview",
              contextWindow: 262144,
              maxOutput: 65536,
              description: "通义千问3Max预览版，支持256k上下文",
              capabilities: ["chat", "reasoning", "tool-calling"]
            },
            {
              id: "kimi-k2-0905",
              name: "Kimi K2 0905",
              contextWindow: 262144,
              maxOutput: 65536,
              description: "月之暗面Kimi K2模型，支持256k上下文",
              capabilities: ["chat", "reasoning", "long-context"]
            },
            {
              id: "glm-4.5",
              name: "GLM-4.5",
              contextWindow: 131072,
              maxOutput: 65536,
              description: "智谱AI GLM-4.5模型，支持128k上下文",
              capabilities: ["chat", "reasoning", "tool-calling"]
            }
          ],
          settings: {
            frequency_penalty: 0.5,
            top_p: 0.7,
            top_k: 50,
            stream: false,
            tools: {
              supported: true,
              maxTools: 128,
              strict: false
            }
          }
        },
        lmstudio: {
          enabled: true,
          name: "LMStudio",
          apiEndpoint: "http://localhost:1234/v1",
          apiKey: "not-needed",
          models: [],
          settings: {
            temperature: 0.7,
            max_tokens: 4096,
            stream: false,
            tools: {
              supported: true,
              maxTools: 64
            }
          }
        }
      },
      llm: {
        cache: {
          enabled: true,
          maxSize: 1000,
          ttl: 3600
        },
        retry: {
          maxAttempts: 3,
          delay: 1000,
          backoff: 2
        },
        logging: {
          enabled: true,
          level: "info",
          file: path.join(this.logDir, 'llm.log')
        }
      },
      mcp: {
        tools: {
          llm: {
            enabled: true,
            description: "AI请求工具，支持多提供商和模型选择"
          }
        }
      }
    };
  }

  /**
   * 保存配置文件
   */
  async saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('保存配置文件失败:', error.message);
    }
  }

  /**
   * 自动检测LMStudio模型
   */
  async autoDetectLMStudioModels() {
    if (!this.config.providers.lmstudio.enabled) {
      return;
    }

    try {
      const response = await axios.get('http://localhost:1234/v1/models', {
        timeout: 5000,
        headers: {
          'Authorization': 'Bearer not-needed'
        }
      });

      if (response.data && response.data.data) {
        const models = response.data.data.map(model => ({
          id: model.id,
          name: model.id.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          contextWindow: this.estimateContextWindow(model.id),
          maxOutput: 4096,
          description: `LMStudio本地模型: ${model.id}`,
          capabilities: ["chat", "local"],
          autoDetected: true
        }));

        this.config.providers.lmstudio.models = models;
        await this.saveConfig();
        console.log(`✅ 检测到 ${models.length} 个LMStudio模型`);
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('⚠️  LMStudio服务未启动，跳过模型检测');
      } else {
        console.log('⚠️  LMStudio模型检测失败:', error.message);
      }
    }
  }

  /**
   * 估算模型上下文窗口大小
   */
  estimateContextWindow(modelId) {
    // 根据模型名称估算上下文窗口大小
    if (modelId.includes('32k') || modelId.includes('32K')) return 32768;
    if (modelId.includes('16k') || modelId.includes('16K')) return 16384;
    if (modelId.includes('8k') || modelId.includes('8K')) return 8192;
    if (modelId.includes('4k') || modelId.includes('4K')) return 4096;
    
    // 根据模型系列估算
    if (modelId.includes('llama') || modelId.includes('llama2') || modelId.includes('llama3')) {
      return modelId.includes('70b') ? 65536 : (modelId.includes('13b') ? 16384 : 8192);
    }
    if (modelId.includes('mistral') || modelId.includes('mixtral')) {
      return modelId.includes('8x7b') ? 65536 : 32768;
    }
    if (modelId.includes('qwen') || modelId.includes('qwen1.5')) {
      return modelId.includes('72b') ? 32768 : (modelId.includes('14b') ? 16384 : 8192);
    }
    
    // 默认值
    return 8192;
  }

  /**
   * 获取配置
   */
  getConfig() {
    return this.config;
  }

  /**
   * 获取默认提供商和模型
   */
  getDefaultProviderAndModel() {
    const defaultProvider = this.config.defaults.provider;
    const defaultModel = this.config.defaults.model;
    return { provider: defaultProvider, model: defaultModel };
  }

  /**
   * 设置默认提供商和模型
   */
  async setDefaultProviderAndModel(provider, model) {
    if (this.config.providers[provider] && 
        this.config.providers[provider].enabled &&
        this.config.providers[provider].models.find(m => m.id === model)) {
      
      this.config.defaults.provider = provider;
      this.config.defaults.model = model;
      await this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 获取所有可用模型
   */
  getAvailableModels() {
    const models = [];
    
    for (const [providerId, provider] of Object.entries(this.config.providers)) {
      if (provider.enabled) {
        for (const model of provider.models) {
          models.push({
            provider: providerId,
            providerName: provider.name,
            model: model.id,
            modelName: model.name,
            contextWindow: model.contextWindow,
            maxOutput: model.maxOutput,
            description: model.description,
            capabilities: model.capabilities
          });
        }
      }
    }
    
    return models;
  }

  /**
   * 获取提供商信息
   */
  getProviderInfo(providerId) {
    return this.config.providers[providerId];
  }

  /**
   * 检查API密钥
   */
  validateApiKeys() {
    const issues = [];
    
    if (this.config.providers.iflow.enabled) {
      const apiKey = this.config.providers.iflow.apiKey;
      if (!apiKey || apiKey === 'your-iflow-api-key-here') {
        issues.push('iFlow API密钥未配置');
      } else if (!apiKey.startsWith('sk-')) {
        issues.push('iFlow API密钥格式不正确');
      }
    }
    
    return issues;
  }

  /**
   * 记录日志
   */
  log(message, level = 'info') {
    if (!this.config.llm.logging.enabled) return;
    
    const logFile = this.config.llm.logging.file;
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    
    try {
      fs.appendFileSync(logFile, logMessage);
    } catch (error) {
      console.error('写入日志失败:', error.message);
    }
  }
}

module.exports = WebAutoConfigManager;