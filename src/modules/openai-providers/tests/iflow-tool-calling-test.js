#!/usr/bin/env node

/**
 * iFlow 工具调用详细测试
 * 详细测试iFlow API的工具调用功能
 */

const { createProvider, createCompatibility } = require('../dist/index.js');

// 配置 - 使用实际的API key
const config = {
  iflow: {
    apiKey: 'sk-faec4c4af5c9e791d012c238662ee708',
    endpoint: 'https://apis.iflow.cn/v1/chat/completions',
    supportedModels: ['qwen3-coder'],
    defaultModel: 'qwen3-coder',
    timeout: 120000
  }
};

// 测试工具定义
const testTools = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出指定目录中的文件和文件夹',
      parameters: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: '要列出的目录路径'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归列出子目录',
            default: false
          }
        },
        required: ['directory']
      },
      strict: false
    }
  }
];

// 测试请求
const testRequests = [
  {
    name: '简单文件列表请求',
    request: {
      model: 'qwen3-coder',
      messages: [
        {
          role: 'user',
          content: '请列出当前目录中的文件和文件夹，使用list_files工具'
        }
      ],
      tools: testTools,
      tool_choice: 'auto',
      temperature: 0.1
    }
  },
  {
    name: '强制工具调用请求',
    request: {
      model: 'qwen3-coder',
      messages: [
        {
          role: 'user',
          content: '列出当前目录的文件'
        }
      ],
      tools: testTools,
      tool_choice: { type: 'function', function: { name: 'list_files' } },
      temperature: 0.1
    }
  },
  {
    name: '无工具的普通请求',
    request: {
      model: 'qwen3-coder',
      messages: [
        {
          role: 'user',
          content: '你好，请简单介绍一下你自己'
        }
      ],
      temperature: 0.7
    }
  }
];

async function testiFlowToolCalling() {
  console.log('🚀 开始iFlow工具调用详细测试...\n');

  try {
    // 创建Provider和Compatibility
    const provider = createProvider('iflow', config.iflow);
    const compatibility = createCompatibility('iflow');

    console.log('📋 Provider信息:');
    console.log(`  名称: ${provider.name}`);
    console.log(`  端点: ${provider.endpoint}`);
    console.log(`  模型: ${config.iflow.defaultModel}`);
    console.log('');

    for (const test of testRequests) {
      console.log(`🧪 测试: ${test.name}`);
      console.log('请求配置:', JSON.stringify(test.request, null, 2));

      try {
        // 使用compatibility映射请求
        const mappedRequest = compatibility.mapRequest(test.request);
        console.log('\n📝 映射后的请求:');
        console.log(JSON.stringify(mappedRequest, null, 2));

        // 发送请求
        const response = await provider.executeChat(mappedRequest);
        
        console.log('\n✅ iFlow API响应:');
        console.log('状态码:', response.status || 'N/A');
        console.log('响应头:', response.headers || 'N/A');
        
        if (response.data) {
          console.log('\n📦 响应数据:');
          console.log(JSON.stringify(response.data, null, 2));
          
          // 分析响应
          if (response.data.choices && response.data.choices.length > 0) {
            const choice = response.data.choices[0];
            console.log('\n🔍 响应分析:');
            console.log(`  Finish Reason: ${choice.finish_reason}`);
            console.log(`  内容: ${choice.message.content || '无内容'}`);
            
            if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
              console.log('\n🛠️  检测到工具调用:');
              choice.message.tool_calls.forEach((toolCall, index) => {
                console.log(`  ${index + 1}. 工具: ${toolCall.function.name}`);
                console.log(`     ID: ${toolCall.id}`);
                console.log(`     参数: ${toolCall.function.arguments}`);
              });
            } else {
              console.log('\n❌ 未检测到工具调用');
            }
          } else {
            console.log('\n⚠️  响应中没有choices数组或数组为空');
          }
          
          if (response.data.usage) {
            console.log('\n📊 Token使用情况:');
            console.log(`  Prompt Tokens: ${response.data.usage.prompt_tokens}`);
            console.log(`  Completion Tokens: ${response.data.usage.completion_tokens}`);
            console.log(`  Total Tokens: ${response.data.usage.total_tokens}`);
          }
        } else {
          console.log('\n❌ 响应中没有数据');
        }

      } catch (error) {
        console.log('\n❌ 请求失败:', error.message);
        if (error.response) {
          console.log('错误响应:', error.response.data);
        }
        if (error.stack) {
          console.log('错误堆栈:', error.stack);
        }
      }

      console.log('\n' + '='.repeat(80) + '\n');
      
      // 避免请求过于频繁
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('🎉 iFlow工具调用测试完成！');

  } catch (error) {
    console.error('❌ 测试初始化失败:', error.message);
    console.error('堆栈:', error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testiFlowToolCalling().catch(console.error);
}

module.exports = { testiFlowToolCalling };