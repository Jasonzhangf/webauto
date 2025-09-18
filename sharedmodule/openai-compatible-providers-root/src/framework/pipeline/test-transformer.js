/**
 * Transformer Integration Test
 * 转换器集成测试
 *
 * 测试转换器功能和集成
 */

const transformerManager = require('./TransformerManager');
const UnifiedChatRequest = require('./transformers/UnifiedChatRequest');
const UnifiedChatResponse = require('./transformers/UnifiedChatResponse');

async function testTransformerIntegration() {
  console.log('Starting transformer integration test...');

  try {
    // 测试1: 验证已注册的转换器类型
    console.log('\n1. Testing registered transformer types...');
    const registeredTypes = transformerManager.getRegisteredTypes();
    console.log('Registered types:', registeredTypes);

    if (registeredTypes.length === 0) {
      throw new Error('No transformer types registered');
    }

    // 测试2: 创建转换器实例
    console.log('\n2. Testing transformer creation...');
    const anthropicTransformer = transformerManager.createTransformer('anthropic');
    const openaiTransformer = transformerManager.createTransformer('openai');
    const geminiTransformer = transformerManager.createTransformer('gemini');
    const passThroughTransformer = transformerManager.createTransformer('pass-through');

    console.log('Created transformers successfully');

    // 测试3: Anthropic请求转换测试
    console.log('\n3. Testing Anthropic request transformation...');
    const anthropicRequest = {
      model: 'claude-3-5-sonnet-20240620',
      messages: [
        { role: 'user', content: 'Hello, how are you?' }
      ],
      max_tokens: 1024,
      temperature: 0.7,
      stream: false
    };

    const unifiedRequest = anthropicTransformer.transformRequestIn(anthropicRequest);
    console.log('Anthropic → Unified:', JSON.stringify(unifiedRequest, null, 2));

    const convertedBack = anthropicTransformer.transformRequestOut(unifiedRequest);
    console.log('Unified → Anthropic:', JSON.stringify(convertedBack, null, 2));

    // 测试4: OpenAI请求转换测试
    console.log('\n4. Testing OpenAI request transformation...');
    const openaiRequest = {
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'user', content: 'Hello, how are you?' }
      ],
      max_tokens: 1024,
      temperature: 0.7,
      stream: false
    };

    const unifiedRequest2 = openaiTransformer.transformRequestIn(openaiRequest);
    console.log('OpenAI → Unified:', JSON.stringify(unifiedRequest2, null, 2));

    const convertedBack2 = openaiTransformer.transformRequestOut(unifiedRequest2);
    console.log('Unified → OpenAI:', JSON.stringify(convertedBack2, null, 2));

    // 测试OpenAI模型名称标准化
    console.log('\n5. Testing OpenAI model name normalization...');
    const testModels = ['gpt-4-turbo-preview', 'gpt-3.5-turbo-0125', 'gpt-4-0125-preview', 'gpt-4'];
    testModels.forEach(model => {
      const normalized = openaiTransformer.normalizeModelName(model);
      const denormalized = openaiTransformer.denormalizeModelName(normalized);
      console.log(`  ${model} → ${normalized} → ${denormalized}`);
    });

    // 测试6: Gemini请求转换测试
    console.log('\n6. Testing Gemini request transformation...');
    const geminiRequest = {
      model: 'models/gemini-1.5-pro',
      contents: [
        { role: 'user', parts: [{ text: 'Hello, how are you?' }] }
      ],
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7
      },
      stream: false
    };

    const unifiedRequest3 = geminiTransformer.transformRequestIn(geminiRequest);
    console.log('Gemini → Unified:', JSON.stringify(unifiedRequest3, null, 2));

    const convertedBack3 = geminiTransformer.transformRequestOut(unifiedRequest3);
    console.log('Unified → Gemini:', JSON.stringify(convertedBack3, null, 2));

    // 测试7: PassThrough Transformer测试
    console.log('\n7. Testing PassThrough Transformer...');
    const passThroughTransformerWithConfig = transformerManager.createTransformer('pass-through', {
      modelAliases: {
        'gpt-4-turbo-preview': 'gpt-4-turbo',
        'gpt-3.5-turbo-0125': 'gpt-3.5-turbo'
      },
      defaultParams: {
        temperature: 0.7,
        max_tokens: 1024
      },
      paramLimits: {
        temperature: {
          min: 0,
          max: 2
        }
      }
    });

    const passThroughRequest = {
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'user', content: 'Hello, how are you?' }
      ],
      temperature: 3.0, // 超出范围的值
      stream: false
    };

    const unifiedRequest4 = passThroughTransformerWithConfig.transformRequestIn(passThroughRequest);
    console.log('PassThrough → Unified:', JSON.stringify(unifiedRequest4, null, 2));

    const convertedBack4 = passThroughTransformerWithConfig.transformRequestOut(unifiedRequest4);
    console.log('Unified → PassThrough:', JSON.stringify(convertedBack4, null, 2));

    // 测试8: 简单PassThrough Transformer测试
    console.log('\n8. Testing simple PassThrough Transformer...');
    const simpleRequest = {
      model: 'test-model',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      max_tokens: 1000,
      temperature: 0.8
    };

    const unifiedRequest5 = passThroughTransformer.transformRequestIn(simpleRequest);
    console.log('Simple PassThrough → Unified:', JSON.stringify(unifiedRequest5, null, 2));

    const convertedBack5 = passThroughTransformer.transformRequestOut(unifiedRequest5);
    console.log('Unified → Simple PassThrough:', JSON.stringify(convertedBack5, null, 2));

    // 测试9: 统一请求对象测试
    console.log('\n9. Testing UnifiedChatRequest...');
    const unifiedRequestObj = new UnifiedChatRequest({
      model: 'test-model',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      max_tokens: 1000,
      temperature: 0.8
    });

    unifiedRequestObj.validate();
    console.log('UnifiedChatRequest validated successfully');
    console.log('UnifiedChatRequest JSON:', JSON.stringify(unifiedRequestObj.toJSON(), null, 2));

    // 测试10: 统一响应对象测试
    console.log('\n10. Testing UnifiedChatResponse...');
    const unifiedResponseObj = new UnifiedChatResponse({
      id: 'test-response-id',
      model: 'test-model',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! I am doing well, thank you for asking.'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    });

    unifiedResponseObj.validate();
    console.log('UnifiedChatResponse validated successfully');
    console.log('UnifiedChatResponse JSON:', JSON.stringify(unifiedResponseObj.toJSON(), null, 2));

    // 测试11: 转换器链测试
    console.log('\n11. Testing transformer chain...');
    const transformerConfigs = [
      'anthropic',
      [
        'maxtoken',
        {
          'max_tokens': 130000
        }
      ]
    ];

    // 验证配置
    const isValid = transformerManager.validateConfig({ use: transformerConfigs });
    console.log('Transformer chain config valid:', isValid);

    console.log('\nAll tests passed successfully!');
    return true;

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// 运行测试
if (require.main === module) {
  testTransformerIntegration().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { testTransformerIntegration };