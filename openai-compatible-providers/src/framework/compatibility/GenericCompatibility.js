/**
 * Generic Configuration-Driven Compatibility
 * 通用配置驱动的兼容性实现
 *
 * 支持通过JSON配置文件驱动的兼容性转换
 * 可用于所有OpenAI兼容的Provider
 */

const { ICompatibility } = require("openai-compatible-providers-framework");
const path = require("path");

class GenericCompatibility extends ICompatibility {
  constructor(configPath) {
    const fullPath = path.resolve(configPath);
    const config = require(fullPath);
    super({
      providerName: config.provider.name,
      version: config.provider.version,
      description: config.provider.description,
    });

    this.configPath = configPath;
    this.config = config;
  }

  mapRequest(openaiRequest) {
    const { requestMappings } = this.config;
    const providerRequest = {};

    // 1. 应用默认值
    if (requestMappings.defaults) {
      for (const [field, defaultValue] of Object.entries(
        requestMappings.defaults,
      )) {
        if (openaiRequest[field] === undefined) {
          providerRequest[field] = defaultValue;
        }
      }
    }

    // 2. 处理直接映射的字段
    if (requestMappings.direct) {
      for (const [openaiField, providerField] of Object.entries(
        requestMappings.direct,
      )) {
        if (openaiRequest.hasOwnProperty(openaiField)) {
          providerRequest[providerField] = openaiRequest[openaiField];
        }
      }
    }

    // 3. 处理需要转换的字段
    if (requestMappings.transform) {
      for (const [openaiField, transformConfig] of Object.entries(
        requestMappings.transform,
      )) {
        if (openaiRequest.hasOwnProperty(openaiField)) {
          if (typeof transformConfig === "function") {
            providerRequest[openaiField] = transformConfig(
              openaiRequest[openaiField],
            );
          } else if (transformConfig.transform) {
            providerRequest[openaiField] = transformConfig.transform(
              openaiRequest[openaiField],
            );
          }
        }
      }

    // 4. 验证请求参数
    this.validateRequest(providerRequest);

    return providerRequest;
  }

  mapResponse(providerResponse) {
    const { responseMappings } = this.config;
    const openaiResponse = {};

    // 1. 处理直接映射的字段
    if (responseMappings.direct) {
      for (const [providerField, openaiField] of Object.entries(
        responseMappings.direct,
      )) {
        if (providerResponse.hasOwnProperty(providerField)) {
          openaiResponse[openaiField] = providerResponse[providerField];
        }
      }
    }

    // 2. 处理需要转换的字段
    if (responseMappings.transform) {
      for (const [providerField, transformConfig] of Object.entries(
        responseMappings.transform,
      )) {
        if (providerResponse.hasOwnProperty(providerField)) {
          if (typeof transformConfig === "function") {
            openaiResponse[providerField] = transformConfig(
              providerResponse[providerField],
            );
          } else if (transformConfig.transform) {
            openaiResponse[providerField] = transformConfig.transform(
              providerResponse[providerField],
            );
          }
        }
      }

    return openaiResponse;
  }

  validateRequest(request) {
    const { requestMappings } = this.config;

    if (!requestMappings.validation) {
      return;
    }

    for (const [field, rules] of Object.entries(requestMappings.validation)) {
      const value = request[field];

      // 检查必需字段
      if (rules.required && (value === undefined || value === null)) {
        throw new Error(`Required field '${field}' is missing`);
      }

      // 如果字段不存在且不是必需的，跳过验证
      if (value === undefined) {
        continue;
      }

      // 检查最小值
      if (rules.min !== undefined && value < rules.min) {
        console.warn(
          `[${this.config.provider.name} Compatibility] Field '${field}' value ${value} is below minimum ${rules.min}, using minimum`,
        );
        request[field] = rules.min;
      }

      // 检查最大值
      if (rules.max !== undefined && value > rules.max) {
        console.warn(
          `[${this.config.provider.name} Compatibility] Field '${field}' value ${value} exceeds maximum ${rules.max}, using maximum`,
        );
        request[field] = rules.max;
      }

      // 检查数组最大长度
      if (
        rules.maxItems !== undefined &&
        Array.isArray(value) &&
        value.length > rules.maxItems
      ) {
        console.warn(
          `[${this.config.provider.name} Compatibility] Field '${field}' array length ${value.length} exceeds maximum ${rules.maxItems}, truncating`,
        );
        request[field] = value.slice(0, rules.maxItems);
      }

      // 检查允许的值
      if (rules.allowedValues && !rules.allowedValues.includes(value)) {
        throw new Error(
          `Field '${field}' value '${value}' is not allowed. Allowed values: ${rules.allowedValues.join(", ")}`,
        );
      }
    }
  }

  getProviderInfo() {
    return {
      name: this.config.provider.name,
      version: this.config.provider.version,
      description: this.config.provider.description,
      apiEndpoint: this.config.provider.apiEndpoint,
      features: this.config.specialRules,
    };
  }

  isToolCallingSupported() {
    return this.config.specialRules?.toolCalling?.supported || false;
  }

  getToolCallingConfig() {
    return this.config.specialRules?.toolCalling || {};
  }

  isStreamingSupported() {
    return this.config.specialRules?.streaming?.supported || false;
  }

  getStreamingConfig() {
    return this.config.specialRules?.streaming || {};
  }

  // 重新加载配置（用于热更新）
  reloadConfig() {
    const fullPath = path.resolve(this.configPath);
    delete require.cache[require.resolve(fullPath)];
    this.config = require(fullPath);
  }
}

module.exports = GenericCompatibility;
