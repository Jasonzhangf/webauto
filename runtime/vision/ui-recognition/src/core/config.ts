/**
 * UI识别模块配置管理
 */

import { config as dotenvConfig } from 'dotenv';

// 加载环境变量
dotenvConfig();

export interface UIRecognitionConfig {
  // 服务配置
  port: number;
  host: string;
  nodeEnv: string;

  // 模型配置
  modelService: {
    url: string;
    timeout: number;
    maxTokens: number;
    temperature: number;
    topP: number;
    defaultModel: string;
  };

  // 上下文配置
  context: {
    maxHistoryLength: number;
    contextCompressionEnabled: boolean;
    contextWindowSize: number;
    sessionTimeout: number;
  };

  // CORS配置
  cors: {
    allowedOrigins: string[];
    credentials: boolean;
  };

  // 缓存配置
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };

  // 日志配置
  logging: {
    level: string;
    file: string;
    maxSize: string;
    maxFiles: number;
  };

  // 安全配置
  security: {
    rateLimit: {
      windowMs: number;
      max: number;
    };
    maxRequestSize: string;
  };

  // 系统提示词配置文件路径
  prompts: {
    systemPromptsPath: string;
    templatePath: string;
  };
}

const config: UIRecognitionConfig = {
  // 服务配置
  port: parseInt(process.env.PORT || '7007'),
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',

  // 模型配置
  modelService: {
    url: process.env.MODEL_SERVICE_URL || 'http://localhost:8898',
    timeout: parseInt(process.env.MODEL_TIMEOUT || '30000'),
    maxTokens: parseInt(process.env.MAX_TOKENS || '8192'), // 8K tokens
    temperature: parseFloat(process.env.TEMPERATURE || '0.1'),
    topP: parseFloat(process.env.TOP_P || '0.9'),
    defaultModel: process.env.DEFAULT_MODEL || 'ui-ins-7b'
  },

  // 上下文配置
  context: {
    maxHistoryLength: parseInt(process.env.MAX_HISTORY_LENGTH || '20'),
    contextCompressionEnabled: process.env.CONTEXT_COMPRESSION !== 'false',
    contextWindowSize: parseInt(process.env.CONTEXT_WINDOW_SIZE || '10'),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '1800000') // 30分钟
  },

  // CORS配置
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: process.env.CORS_CREDENTIALS === 'true'
  },

  // 缓存配置
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CACHE_TTL || '300000'), // 5分钟
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000')
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/ui-recognition.log',
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5')
  },

  // 安全配置
  security: {
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15分钟
      max: parseInt(process.env.RATE_LIMIT_MAX || '100')
    },
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '50mb'
  },

  // 系统提示词配置文件路径
  prompts: {
    systemPromptsPath: process.env.SYSTEM_PROMPTS_PATH || './config/system-prompts.json',
    templatePath: process.env.TEMPLATE_PATH || './src/core/prompt-templates.json'
  }
};

// 验证配置
function validateConfig(): void {
  if (config.modelService.maxTokens < 1 || config.modelService.maxTokens > 32768) {
    throw new Error(`Invalid maxTokens: ${config.modelService.maxTokens}. Must be between 1 and 32768`);
  }

  if (config.modelService.temperature < 0 || config.modelService.temperature > 2) {
    throw new Error(`Invalid temperature: ${config.modelService.temperature}. Must be between 0 and 2`);
  }

  if (config.context.contextWindowSize < 1 || config.context.contextWindowSize > 50) {
    throw new Error(`Invalid context window size: ${config.context.contextWindowSize}. Must be between 1 and 50`);
  }
}

// 运行时验证
try {
  validateConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}

export { config };