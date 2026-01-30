import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConfigValidator } from './ConfigValidator.js';
import type { Config, ConfigLoaderOptions, DeepPartial, ValidationResult } from './types.js';

function resolveHomeDir() {
  // On Windows, Git Bash may set HOME like "/c/Users/xxx" which breaks `path.join` (win32).
  // Prefer USERPROFILE / os.homedir() on win32 to keep native paths.
  const homeDir =
    process.platform === 'win32'
      ? (process.env.USERPROFILE || os.homedir() || '')
      : (process.env.HOME || os.homedir() || '');
  if (!homeDir) throw new Error('无法获取用户主目录：HOME/USERPROFILE 未设置');
  return homeDir;
}

/**
 * 配置加载器
 * 负责加载、验证和缓存配置文件
 */
export class ConfigLoader {
  private validator: ConfigValidator;
  private configPath: string;
  private config: Config | null = null;
  private cacheEnabled: boolean;
  private validateEnabled: boolean;

  constructor(options: ConfigLoaderOptions = {}) {
    this.validator = new ConfigValidator();
    const cache = options.cache ?? options.strictMode;
    this.cacheEnabled = cache !== false;
    this.validateEnabled = options.validate !== false;
    
    // 计算配置文件路径
    // 优先级：1. 传入的 configPath 2. 环境变量 WEBAUTO_CONFIG_PATH 3. 默认 ~/.webauto/config.json
    this.configPath =
      options.configPath ||
      process.env.WEBAUTO_CONFIG_PATH ||
      path.join(resolveHomeDir(), '.webauto', 'config.json');
  }

  /**
   * 加载配置
   * @param options 选项
   * @returns 配置对象
   * @throws 如果配置文件不存在或验证失败
   */
  async load(options: { createIfMissing?: boolean } = {}): Promise<Config> {
    // 如果缓存已启用且配置已加载，直接返回缓存
    if (this.cacheEnabled && this.config) {
      return this.config;
    }

    // 检查配置文件是否存在
    try {
      await fs.access(this.configPath);
    } catch {
      // 配置文件不存在
      if (options.createIfMissing) {
        // 隐式创建默认配置
        console.warn(`配置文件不存在: ${this.configPath}，创建默认配置`);
        this.config = this.validator.getDefaultConfig();
        await this.save(this.config);
      } else {
        // 显式抛出错误
        throw new Error(`配置文件不存在: ${this.configPath}，请先调用 ensureExists() 创建配置`);
      }
      return this.config!;
    }

    // 读取配置文件
    const content = await fs.readFile(this.configPath, 'utf-8');
    const rawConfig = JSON.parse(content);

    // 验证配置
    if (this.validateEnabled) {
      const result = this.validator.validate(rawConfig);
      if (!result.valid) {
        const errorMessages = result.errors?.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
        throw new Error(`配置验证失败:\n${errorMessages}`);
      }
    }

    this.config = rawConfig as Config;
    return this.config;
  }

  /**
   * 确保配置文件存在
   * 如果不存在则创建默认配置
   */
  async ensureExists(): Promise<void> {
    try {
      await fs.access(this.configPath);
    } catch {
      // 配置文件不存在，创建默认配置
      const defaultConfig = this.validator.getDefaultConfig();
      
      // 确保目录存在
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      await fs.writeFile(
        this.configPath,
        JSON.stringify(defaultConfig, null, 2),
        'utf-8'
      );

      // 更新缓存
      this.config = defaultConfig;
      
      console.log(`已创建默认配置文件: ${this.configPath}`);
    }
  }

  /**
   * 保存配置
   * @param config 配置对象
   */
  async save(config: Config): Promise<void> {
    // 验证配置
    if (this.validateEnabled) {
      const result = this.validator.validate(config);
      if (!result.valid) {
        const errorMessages = result.errors?.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
        throw new Error(`配置验证失败:\n${errorMessages}`);
      }
    }

    // 确保目录存在
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });

    // 写入配置文件
    await fs.writeFile(
      this.configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    // 更新缓存
    this.config = config;
  }

  /**
   * 重新加载配置
   * @returns 配置对象
   */
  async reload(): Promise<Config> {
    this.config = null;
    return this.load();
  }

  /**
   * 获取配置（不加载，仅返回缓存）
   * @returns 配置对象或 null
   */
  get(): Config | null {
    return this.config;
  }

  /**
   * 验证配置文件
   * @returns 验证结果
   */
  async validate(): Promise<ValidationResult> {
    return this.validator.validateFile(this.configPath);
  }

  /**
   * 获取配置文件路径
   * @returns 配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 获取默认配置
   * @returns 默认配置对象
   */
  getDefaultConfig(): Config {
    return this.validator.getDefaultConfig();
  }

  /**
   * 合并配置
   * @param base 基础配置
   * @param override 覆盖配置
   * @returns 合并后的配置
   */
  merge(base: Config, override: DeepPartial<Config>): Config {
    const deepMerge = (a: any, b: any): any => {
      if (b === undefined) return a;
      if (a === null || a === undefined) return b;
      if (Array.isArray(a) || Array.isArray(b)) return b;
      if (typeof a !== 'object' || typeof b !== 'object') return b;
      const out: Record<string, any> = { ...a };
      for (const [k, v] of Object.entries(b)) {
        out[k] = deepMerge((a as any)[k], v);
      }
      return out;
    };
    return deepMerge(base, override) as Config;
  }
}
