/**
 * Compatibility Manager
 * 兼容性模块管理器
 *
 * 负责扫描、注册和管理所有的兼容性配置
 */

const fs = require("fs");
const path = require("path");
const GenericCompatibility = require("./compatibility/GenericCompatibility");

class CompatibilityManager {
  constructor() {
    this.compatibilityModules = new Map();
    this.configPaths = [];
  }

  /**
   * 扫描指定目录中的JSON配置文件
   * @param {string} configDir 配置文件目录
   * @returns {string[]} 发现的配置文件路径
   */
  scanConfigDirectory(configDir) {
    if (!fs.existsSync(configDir)) {
      console.warn(`Configuration directory does not exist: ${configDir}`);
      return [];
    }

    const files = fs.readdirSync(configDir);
    const configFiles = [];

    files.forEach((file) => {
      if (file.endsWith(".config.json")) {
        const configPath = path.join(configDir, file);
        configFiles.push(configPath);
        console.log(`Found compatibility config: ${configPath}`);
      }
    });

    return configFiles;
  }

  /**
   * 注册外部的JSON配置文件
   * @param {string} configPath 配置文件路径
   * @param {string} [name] 可选的模块名称，如果未提供则从配置中读取
   * @returns {boolean} 注册是否成功
   */
  registerExternalConfig(configPath, name) {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(configPath)) {
        console.error(`Configuration file not found: ${configPath}`);
        return false;
      }

      // 验证JSON格式 - 使用完整路径
      const fullPath = path.resolve(configPath);
      const config = require(fullPath);
      if (!config.provider || !config.provider.name) {
        console.error(`Invalid configuration format: ${configPath}`);
        return false;
      }

      // 获取模块名称
      const moduleName = name || config.provider.name;

      // 创建兼容性模块
      const compatibility = new GenericCompatibility(configPath);

      // 注册模块
      this.compatibilityModules.set(moduleName, {
        configPath,
        compatibility,
        config,
        isExternal: true,
      });

      console.log(
        `Registered external compatibility module: ${moduleName} from ${configPath}`,
      );
      return true;
    } catch (error) {
      console.error(
        `Failed to register external config ${configPath}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * 批量注册配置文件
   * @param {string[]} configPaths 配置文件路径数组
   * @returns {Object} 注册结果统计
   */
  registerConfigs(configPaths) {
    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    configPaths.forEach((configPath) => {
      if (this.registerExternalConfig(configPath)) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(configPath);
      }
    });

    console.log(
      `Registration completed: ${results.success} success, ${results.failed} failed`,
    );
    if (results.errors.length > 0) {
      console.warn("Failed configurations:", results.errors);
    }

    return results;
  }

  /**
   * 扫描并注册目录中的所有配置文件
   * @param {string} configDir 配置文件目录
   * @returns {Object} 注册结果统计
   */
  scanAndRegister(configDir) {
    const configFiles = this.scanConfigDirectory(configDir);
    return this.registerConfigs(configFiles);
  }

  /**
   * 获取已注册的兼容性模块
   * @param {string} name 模块名称
   * @returns {GenericCompatibility|undefined} 兼容性模块实例
   */
  getCompatibility(name) {
    const module = this.compatibilityModules.get(name);
    return module ? module.compatibility : undefined;
  }

  /**
   * 获取所有已注册的兼容性模块信息
   * @returns {Object[]} 模块信息数组
   */
  getAllCompatibilityInfo() {
    const modules = [];
    this.compatibilityModules.forEach((module, name) => {
      modules.push({
        name,
        configPath: module.configPath,
        provider: module.config.provider,
        isExternal: module.isExternal,
        features: {
          toolCalling: module.compatibility.isToolCallingSupported(),
          streaming: module.compatibility.isStreamingSupported(),
        }
      });
    });
    return modules;
  }

  /**
   * 列出所有可用的兼容性模块
   */
  listAvailableModules() {
    const modules = this.getAllCompatibilityInfo();
    console.log("Available Compatibility Modules:");
    console.log("=".repeat(50));

    modules.forEach((module) => {
      console.log(`\n📋 ${module.name}`);
      console.log(
        `   Provider: ${module.provider.name} v${module.provider.version}`,
      );
      console.log(`   Endpoint: ${module.provider.apiEndpoint}`);
      console.log(`   Description: ${module.provider.description}`);
      console.log(`   Source: ${module.isExternal ? "External" : "Built-in"}`);
      console.log(
        `   Tool Calling: ${module.features.toolCalling ? "✅" : "❌"}`,
      );
      console.log(`   Streaming: ${module.features.streaming ? "✅" : "❌"}`);
      console.log(`   Config: ${module.configPath}`);
    });
  }

  /**
   * 卸载指定的兼容性模块
   * @param {string} name 模块名称
   * @returns {boolean} 卸载是否成功
   */
  unregister(name) {
    if (this.compatibilityModules.has(name)) {
      this.compatibilityModules.delete(name);
      console.log(`Unregistered compatibility module: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * 重新加载指定的兼容性模块配置
   * @param {string} name 模块名称
   * @returns {boolean} 重新加载是否成功
   */
  reloadModule(name) {
    const module = this.compatibilityModules.get(name);
    if (!module) {
      console.error(`Module not found: ${name}`);
      return false;
    }

    try {
      // 清除require缓存
      const fullPath = path.resolve(module.configPath);
      delete require.cache[require.resolve(fullPath)];

      // 重新加载配置
      const newConfig = require(fullPath);
      const newCompatibility = new GenericCompatibility(module.configPath);

      // 更新模块
      module.config = newConfig;
      module.compatibility = newCompatibility;

      console.log(`Reloaded compatibility module: ${name}`);
      return true;
    } catch (error) {
      console.error(`Failed to reload module ${name}:`, error.message);
      return false;
    }
  }

  /**
   * 验证配置文件格式
   * @param {string} configPath 配置文件路径
   * @returns {Object} 验证结果
   */
  validateConfig(configPath) {
    try {
      const fullPath = path.resolve(configPath);
      const config = require(fullPath);

      const required = ["provider"];
      const providerRequired = [
        "name",
        "version",
        "description",
        "apiEndpoint",
      ];

      const errors = [];

      // 检查必需字段
      required.forEach((field) => {
        if (!config[field]) {
          errors.push(`Missing required field: ${field}`);
        }
      });

      if (config.provider) {
        providerRequired.forEach((field) => {
          if (!config.provider[field]) {
            errors.push(`Missing required provider field: ${field}`);
          }
        });
      }

      // 检查映射结构
      if (config.requestMappings) {
        const mappingTypes = ["direct", "transform", "defaults", "validation"];
        mappingTypes.forEach((type) => {
          if (
            config.requestMappings[type] &&
            typeof config.requestMappings[type] !== "object"
          ) {
            errors.push(`requestMappings.${type} must be an object`);
          }
        });
      }

      return {
        valid: errors.length === 0,
        errors,
        config,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        config: null,
      };
    }
  }

  /**
   * 创建新的兼容性配置模板
   * @param {Object} options 配置选项
   * @returns {string} JSON配置内容
   */
  createConfigTemplate(options = {}) {
    const template = {
      provider: {
        name: options.name || "my-provider",
        version: options.version || "1.0.0",
        description: options.description || "My custom provider",
        apiEndpoint:
          options.apiEndpoint || "https://api.example.com/v1/chat/completions",
      },
      requestMappings: {
        direct: {
          model: 'model',
          messages: 'messages',
          temperature: 'temperature',
          max_tokens: 'max_tokens',
          stream: 'stream',
          tools: 'tools',
          tool_choice: 'tool_choice',
        },
        transform: {},
        defaults: {
          temperature: 0.7,
          max_tokens: 1024,
          stream: false
        },
        validation: {
          model: { required: true },
          messages: { required: true },
          max_tokens: { min: 1, max: 8192 }
        }
      },
      responseMappings: {
        direct: {
          id: 'id',
          object: 'object',
          created: 'created',
          model: 'model',
          choices: 'choices',
          usage: 'usage',
        },
        transform: {},
      },
      specialRules: {
        toolCalling: {
          supported: true,
          maxTools: 128,
        },
        streaming: {
          supported: true,
          format: 'server-sent-events',
        },
      }
    };

    return JSON.stringify(template, null, 2);
  }

  /**
   * 导出当前所有配置到指定目录
   * @param {string} exportDir 导出目录
   * @returns {string[]} 导出的文件路径
   */
  exportConfigs(exportDir) {
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const exportedFiles = [];

    this.compatibilityModules.forEach((module, name) => {
      const exportPath = path.join(
        exportDir,
        `${name}-compatibility.config.json`,
      );
      fs.writeFileSync(exportPath, JSON.stringify(module.config, null, 2));
      exportedFiles.push(exportPath);
    });

    console.log(
      `Exported ${exportedFiles.length} configurations to ${exportDir}`,
    );
    return exportedFiles;
  }
}

module.exports = CompatibilityManager;
