import { Ajv, type ValidateFunction } from 'ajv';
import { 
  mainSchema,
  browserServiceSchema,
  portsSchema,
  environmentsSchema,
  uiSchema
} from './schemas/index.js';
import type { Config, ValidationResult } from './types.js';

/**
 * 配置验证器
 * 使用 AJV (Another JSON Schema Validator) 验证配置文件
 */
export class ConfigValidator {
  private ajv: Ajv;
  private validateFn: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      allowUnionTypes: true
    });
    
    // 注册所有 schemas（包括子 schema）
    this.registerSchemas();

    // 编译校验函数（避免每次 validate 都 compile）
    this.validateFn = this.ajv.compile(mainSchema);
  }

  /**
   * 注册所有 JSON Schema
   */
  private registerSchemas(): void {
    // 先注册所有子 schema
    this.ajv.addSchema(browserServiceSchema);
    this.ajv.addSchema(portsSchema);
    this.ajv.addSchema(environmentsSchema);
    this.ajv.addSchema(uiSchema);
    
    // 最后注册主 schema
    this.ajv.addSchema(mainSchema);
  }

  /**
   * 验证配置对象
   * @param config 配置对象
   * @returns 验证结果
   */
  validate(config: unknown): ValidationResult {
    const valid = this.validateFn(config);

    if (valid) {
      return { valid: true };
    }

    const errors = this.validateFn.errors?.map((error) => ({
      path: error.instancePath || '/root',
      message: error.message || '未知错误'
    })) || [];

    return {
      valid: false,
      errors
    };
  }

  /**
   * 验证配置文件
   * @param configPath 配置文件路径
   * @returns 验证结果
   */
  async validateFile(configPath: string): Promise<ValidationResult> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      return this.validate(config);
    } catch (error) {
      return {
        valid: false,
        errors: [{
          path: configPath,
          message: error instanceof Error ? error.message : '读取或解析配置文件失败'
        }]
      };
    }
  }

  /**
   * 获取默认配置
   * @returns 默认配置对象
   */
  getDefaultConfig(): Config {
    return {
      browserService: {
        host: '0.0.0.0',
        port: 7704,
        backend: {
          baseUrl: 'http://127.0.0.1:7701'
        },
        healthCheck: {
          autoCheck: true,
          strictMode: false,
          skipOnFirstSuccess: true,
          timeout: 30000
        }
      },
      ports: {
        unified_api: 7701,
        browser_service: 7704,
        floating_bus: 8790
      },
      environments: {
        development: {
          NODE_ENV: 'development',
          WEBAUTO_DEBUG: '1',
          WEBAUTO_LOG_LEVEL: 'debug'
        },
        production: {
          NODE_ENV: 'production',
          WEBAUTO_DEBUG: '0',
          WEBAUTO_LOG_LEVEL: 'info'
        }
      },
      ui: {
        window: {
          width: 800,
          height: 600,
          minWidth: 400,
          minHeight: 300
        },
        theme: 'auto',
        autoHide: false
      }
    } as Config;
  }
}
