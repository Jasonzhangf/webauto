#!/usr/bin/env node

/**
 * 测试Qwen工具调用功能（全新认证）
 * Test Qwen tool calling functionality with fresh authentication
 */

const { QwenProvider } = require('./dist/index');
const path = require('path');

async function testToolCallingWithFreshAuth() {
  console.log('🔧 Testing Qwen Tool Calling with Fresh Authentication...\n');

  try {
    // 创建Qwen Provider实例
    console.log('1. Creating Qwen Provider...');
    const qwenProvider = new QwenProvider({
      name: 'qwen-tool-test-fresh',
      endpoint: 'https://chat.qwen.ai/api/v1/chat/completions',
      supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-turbo',
      tokenStoragePath: path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-token-fresh.json')
    });

    console.log('✅ Qwen Provider created successfully');

    // 直接进行认证
    console.log('\n2. Initiating OAuth authentication...');
    console.log('🌐 Opening browser for authentication...');
    console.log('📋 Please complete the authentication in the browser and wait...');

    // 启动OAuth流程
    const authResult = await qwenProvider.authenticate(true); // true = auto-open browser

    if (authResult.success) {
      console.log('✅ Authentication successful!');
      console.log('📋 Access token obtained');
    } else {
      console.log('❌ Authentication failed:', authResult.error);
      return;
    }

    // 测试工具调用
    console.log('\n3. Testing tool calling with Qwen...');

    const toolCallingRequest = {
      model: 'qwen-turbo',
      messages: [
        {
          role: 'user',
          content: '请帮我计算 15 + 27 的结果，使用计算器工具'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: '执行数学计算',
            parameters: {
              type: 'object',
              properties: {
                expression: {
                  type: 'string',
                  description: '要计算的数学表达式，如 "15 + 27"'
                }
              },
              required: ['expression']
            }
          }
        }
      ],
      tool_choice: 'auto'
    };

    console.log('📤 Sending tool calling request to Qwen...');
    console.log('Request: Tool calling for calculation 15 + 27');

    try {
      const response = await qwenProvider.chat(toolCallingRequest);

      console.log('\n✅ Tool calling request completed!');
      console.log('Response preview:', JSON.stringify(response, null, 2).substring(0, 500) + '...');

      // 分析响应
      if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];

        if (choice.message && choice.message.tool_calls) {
          console.log('\n🔧 Tool calls detected:');
          choice.message.tool_calls.forEach((toolCall, index) => {
            console.log(`Tool Call ${index + 1}:`);
            console.log(`  - ID: ${toolCall.id}`);
            console.log(`  - Type: ${toolCall.type}`);
            console.log(`  - Function: ${toolCall.function.name}`);
            console.log(`  - Arguments: ${JSON.stringify(toolCall.function.arguments, null, 2)}`);
          });
          console.log('\n✅ Tool calling is working correctly!');
        } else {
          console.log('\n⚠️  No tool calls in response, but request was successful');
          if (choice.message && choice.message.content) {
            console.log('\n💬 Assistant response:');
            console.log(choice.message.content);
          }
        }
      }

      console.log('\n🎉 Tool calling test completed successfully!');

    } catch (error) {
      console.log('\n❌ Tool calling test failed:', error.message);
      if (error.response) {
        console.log('API Response:', error.response.status, error.response.data);
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// 运行测试
testToolCallingWithFreshAuth();