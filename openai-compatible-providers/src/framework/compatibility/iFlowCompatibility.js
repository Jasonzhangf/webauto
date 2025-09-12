/**
 * iFlow Compatibility
 * iFlow兼容性实现
 *
 * 使用通用配置驱动的兼容性实现
 * 配置文件: ../config/iflow-compatibility.config.json
 */

const GenericCompatibility = require('./GenericCompatibility');

class iFlowCompatibility extends GenericCompatibility {
  constructor(config) {
    super('../config/iflow-compatibility.config.json');

    // 添加iFlow特定的转换处理
    this.setupSpecialTransforms();

    // 可以在这里添加特定的配置覆盖
    if (config) {
      Object.assign(this.config, config);
    }
  }

  setupSpecialTransforms() {
    // 为iFlow添加特殊的响应转换处理
    this.specialResponseTransforms = {
      choices: (choices) => {
        if (!Array.isArray(choices)) return choices;

        return choices.map((choice) => {
          const transformedChoice = { ...choice };
          if (choice.message && choice.message.reasoning_content) {
            // 保留reasoning_content字段
            transformedChoice.message.reasoning_content =
              choice.message.reasoning_content;
          }
          return transformedChoice;
        });
      },

      tool_calls: (toolCalls) => {
        if (!Array.isArray(toolCalls)) return toolCalls;

        return toolCalls.map((toolCall) => ({
          ...toolCall,
          function: toolCall.function
            ? {
              ...toolCall.function,
              arguments:
                  typeof toolCall.function.arguments === 'string'
                    ? toolCall.function.arguments
                    : JSON.stringify(toolCall.function.arguments)
            }
            : undefined
        }));
      }
    };
  }

  // 重写mapResponse方法以包含特殊转换
  mapResponse(providerResponse) {
    const openaiResponse = super.mapResponse(providerResponse);

    // 应用iFlow特定的转换
    for (const [field, transform] of Object.entries(
      this.specialResponseTransforms
    )) {
      if (providerResponse.hasOwnProperty(field)) {
        openaiResponse[field] = transform(providerResponse[field]);
      }
    }

    return openaiResponse;
  }
}

module.exports = iFlowCompatibility;
