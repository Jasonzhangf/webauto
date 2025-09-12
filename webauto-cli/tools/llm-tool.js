const WebAutoConfigManager = require('../../utils/WebAutoConfigManager');
const axios = require('axios');

/**
 * LLM MCP工具
 * 支持多提供商AI请求，包括iFlow和LMStudio
 */
class LLMTool {
  constructor() {
    this.configManager = null;
    this.initialized = false;
  }

  /**
   * 初始化LLM工具
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.configManager = new WebAutoConfigManager();
      await this.configManager.initialize();
      this.initialized = true;
      
      this.configManager.log('LLM工具初始化完成');
    } catch (error) {
      throw new Error(`LLM工具初始化失败: ${error.message}`);
    }
  }

  /**
   * 解析命令参数
   */
  parseCommand(args) {
    const command = args.command || '';
    const parts = command.trim().split(/\s+/);
    const subcommand = parts[0] || '';
    
    const result = {
      subcommand,
      provider: null,
      model: null,
      message: null,
      options: {}
    };

    // 解析参数
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      
      if (part === 'provider' && i + 1 < parts.length) {
        result.provider = parts[++i];
      } else if (part === 'model' && i + 1 < parts.length) {
        result.model = parts[++i];
      } else if (part === 'max_tokens' && i + 1 < parts.length) {
        result.options.max_tokens = parseInt(parts[++i]);
      } else if (part === 'temperature' && i + 1 < parts.length) {
        result.options.temperature = parseFloat(parts[++i]);
      } else if (!result.message && (part === 'req' || subcommand !== 'req')) {
        // 收集消息内容
        const messageParts = [];
        while (i < parts.length && !['provider', 'model', 'max_tokens', 'temperature'].includes(parts[i])) {
          messageParts.push(parts[i++]);
        }
        result.message = messageParts.join(' ');
        i--; // 回退一步，因为循环会自增
      }
    }

    // 如果是req命令，消息在req之后
    if (subcommand === 'req' && !result.message) {
      const messageIndex = parts.indexOf('req');
      if (messageIndex !== -1 && messageIndex + 1 < parts.length) {
        result.message = parts.slice(messageIndex + 1).join(' ');
      }
    }

    return result;
  }

  /**
   * 执行LLM命令
   */
  async execute(args) {
    if (!this.initialized) {
      await this.initialize();
    }

    const parsed = this.parseCommand(args);
    const config = this.configManager.getConfig();

    try {
      switch (parsed.subcommand) {
        case 'init':
          return await this.handleInit(config);
        case 'config':
          return await this.handleConfig(parsed, config);
        case 'req':
          return await this.handleRequest(parsed, config);
        case '':
        default:
          return await this.handleInit(config);
      }
    } catch (error) {
      this.configManager.log(`LLM命令执行失败: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * 处理init命令
   */
  async handleInit(config) {
    const models = this.configManager.getAvailableModels();
    const issues = this.configManager.validateApiKeys();
    
    let output = '🤖 可用的AI模型:\n\n';
    
    // 按提供商分组显示
    const providers = {};
    models.forEach(model => {
      if (!providers[model.provider]) {
        providers[model.provider] = [];
      }
      providers[model.provider].push(model);
    });

    for (const [providerId, providerModels] of Object.entries(providers)) {
      const providerInfo = config.providers[providerId];
      output += `${providerId === 'iflow' ? '🔥' : '🏠'} ${providerInfo.name}:\n`;
      
      providerModels.forEach(model => {
        const contextSize = model.contextWindow >= 1024 ? 
          `${(model.contextWindow / 1024).toFixed(0)}k` : 
          `${model.contextWindow}`;
        output += `   • ${model.model} (${model.modelName}) - ${contextSize}上下文\n`;
      });
      output += '\n';
    }

    // 显示当前默认配置
    const defaults = config.defaults;
    output += `📋 当前默认: ${defaults.provider}/${defaults.model}\n`;

    // 显示配置问题
    if (issues.length > 0) {
      output += `\n⚠️  配置问题:\n`;
      issues.forEach(issue => {
        output += `   • ${issue}\n`;
      });
    }

    // 显示使用提示
    output += '\n💡 使用示例:\n';
    output += '   LLM config provider lmstudio\n';
    output += '   LLM req "帮我写一个Python函数"\n';
    output += '   LLM req "解释量子计算" provider iflow model qwen3-max\n';

    return {
      success: true,
      message: output,
      data: {
        providers: Object.keys(providers),
        totalModels: models.length,
        defaultProvider: defaults.provider,
        defaultModel: defaults.model,
        issues: issues
      }
    };
  }

  /**
   * 处理config命令
   */
  async handleConfig(parsed, config) {
    const { provider, model } = parsed;
    const defaults = config.defaults;
    
    let output = '⚙️  当前配置:\n';
    output += `   Provider: ${defaults.provider}\n`;
    output += `   Model: ${defaults.model}\n`;
    output += `   Max Tokens: ${defaults.maxTokens}\n`;
    output += `   Temperature: ${defaults.temperature}\n`;

    if (provider) {
      // 设置提供商
      if (!config.providers[provider]) {
        throw new Error(`未知的提供商: ${provider}`);
      }
      
      if (!config.providers[provider].enabled) {
        throw new Error(`提供商 ${provider} 未启用`);
      }
    }

    if (model) {
      // 设置模型
      const targetProvider = provider || defaults.provider;
      const providerInfo = config.providers[targetProvider];
      
      if (!providerInfo.models.find(m => m.id === model)) {
        throw new Error(`模型 ${model} 在提供商 ${targetProvider} 中不存在`);
      }
    }

    // 更新配置
    if (provider || model) {
      const newProvider = provider || defaults.provider;
      const newModel = model || defaults.model;
      
      const success = await this.configManager.setDefaultProviderAndModel(newProvider, newModel);
      
      if (success) {
        output += `\n✅ 配置已更新: ${newProvider}/${newModel}`;
      } else {
        throw new Error('配置更新失败');
      }
    }

    return {
      success: true,
      message: output,
      data: {
        currentConfig: {
          provider: defaults.provider,
          model: defaults.model,
          maxTokens: defaults.maxTokens,
          temperature: defaults.temperature
        },
        updated: !!(provider || model)
      }
    };
  }

  /**
   * 处理req命令
   */
  async handleRequest(parsed, config) {
    const { message, provider, model, options } = parsed;
    
    if (!message) {
      throw new Error('请提供请求消息');
    }

    // 确定使用的提供商和模型
    const targetProvider = provider || config.defaults.provider;
    const targetModel = model || config.defaults.model;
    
    // 验证提供商和模型
    if (!config.providers[targetProvider]) {
      throw new Error(`未知的提供商: ${targetProvider}`);
    }
    
    if (!config.providers[targetProvider].enabled) {
      throw new Error(`提供商 ${targetProvider} 未启用`);
    }

    const providerInfo = config.providers[targetProvider];
    const modelInfo = providerInfo.models.find(m => m.id === targetModel);
    
    if (!modelInfo) {
      throw new Error(`模型 ${targetModel} 在提供商 ${targetProvider} 中不存在`);
    }

    // 验证API密钥
    if (targetProvider === 'iflow') {
      const apiKey = providerInfo.apiKey;
      if (!apiKey || apiKey === 'your-iflow-api-key-here') {
        throw new Error('iFlow API密钥未配置，请在 ~/.webauto/config.json 中配置');
      }
    }

    this.configManager.log(`发送请求到 ${targetProvider}/${targetModel}: ${message.substring(0, 50)}...`);

    // 发送请求
    const response = await this.sendRequest(targetProvider, targetModel, message, options, providerInfo);

    return {
      success: true,
      message: `🤖 ${targetProvider}/${targetModel} 响应:\n\n${response.content}`,
      data: {
        provider: targetProvider,
        model: targetModel,
        request: message,
        response: response.content,
        usage: response.usage,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * 发送API请求
   */
  async sendRequest(provider, model, message, options, providerInfo) {
    const config = this.configManager.getConfig();
    const defaultSettings = config.defaults;
    
    // 构建请求参数
    const requestParams = {
      model: model,
      messages: [
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: options.max_tokens || defaultSettings.maxTokens,
      temperature: options.temperature !== undefined ? options.temperature : defaultSettings.temperature,
      stream: false
    };

    // 添加提供商特定参数
    if (provider === 'iflow') {
      Object.assign(requestParams, providerInfo.settings);
    } else if (provider === 'lmstudio') {
      Object.assign(requestParams, providerInfo.settings);
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    // 设置认证
    if (provider === 'iflow') {
      headers['Authorization'] = `Bearer ${providerInfo.apiKey}`;
    } else if (provider === 'lmstudio') {
      headers['Authorization'] = `Bearer ${providerInfo.apiKey}`;
    }

    try {
      const response = await axios.post(providerInfo.apiEndpoint + '/chat/completions', requestParams, {
        headers,
        timeout: defaultSettings.timeout,
        maxContentLength: Infinity
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const choice = response.data.choices[0];
        const content = choice.message?.content || choice.content || '';
        
        this.configManager.log(`请求成功，响应长度: ${content.length}`);
        
        return {
          content: content,
          usage: response.data.usage || {}
        };
      } else {
        throw new Error('API响应格式不正确');
      }
    } catch (error) {
      this.configManager.log(`API请求失败: ${error.message}`, 'error');
      
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData.error?.message || errorData.message || '未知错误';
        throw new Error(`API错误: ${errorMessage}`);
      } else if (error.request) {
        throw new Error('网络连接失败，请检查服务是否运行');
      } else {
        throw new Error(`请求失败: ${error.message}`);
      }
    }
  }

  /**
   * 获取工具定义
   */
  getToolDefinition() {
    return {
      name: 'llm',
      description: 'AI请求工具，支持多提供商和模型选择。命令格式: LLM [init|config|req] [options]',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'LLM命令字符串。示例: "init", "config provider lmstudio", "req \"解释量子计算\" provider iflow model qwen3-max"'
          }
        },
        required: ['command']
      }
    };
  }
}

module.exports = LLMTool;