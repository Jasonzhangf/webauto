#!/usr/bin/env node

/**
 * Qwen工具调用测试 - 增长OAuth等待时间
 * Qwen Tool Calling Test - Extended OAuth Wait Time
 */

const { QwenProvider } = require('./dist/index');
const path = require('path');

async function testToolCallingExtendedWait() {
  console.log('🔧 Testing Qwen Tool Calling with Extended OAuth Wait Time...\n');

  try {
    // 创建Qwen Provider实例
    console.log('1. Creating Qwen Provider...');
    const qwenProvider = new QwenProvider({
      name: 'qwen-extended-test',
      endpoint: 'https://chat.qwen.ai/api/v1/chat/completions',
      supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-turbo',
      tokenStoragePath: path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-token-extended.json')
    });

    console.log('✅ Qwen Provider created successfully');

    // 使用延长等待时间的认证
    console.log('\n2. Initiating OAuth with extended wait time...');
    console.log('🌐 Opening browser for authentication...');
    console.log('⏱️  Wait time: 10 minutes total (10s intervals, 60 attempts)');
    console.log('📋 Please complete the authentication in the browser and wait...');

    try {
      // 启动OAuth流程，延长等待时间
      const authResult = await qwenProvider.authenticate(true, { 
        interval: 10,  // 10秒间隔
        maxAttempts: 60  // 60次尝试 = 10分钟
      });

      if (authResult.success) {
        console.log('✅ Authentication successful!');
        console.log('📋 Access token obtained');

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

        const response = await qwenProvider.chat(toolCallingRequest);

        console.log('\n✅ Tool calling request completed!');
        
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
            console.log('\n⚠️  No tool calls in response');
            if (choice.message && choice.message.content) {
              console.log('\n💬 Assistant response:');
              console.log(choice.message.content);
            }
          }
        }

        console.log('\n🎉 Extended tool calling test completed successfully!');
        
      } else {
        console.log('❌ Authentication failed:', authResult.error);
      }

    } catch (authError) {
      console.log('❌ Authentication process failed:', authError.message);
      console.log('This might be due to:');
      console.log('  - Network connectivity issues');
      console.log('  - OAuth service problems');
      console.log('  - Browser authentication not completed');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// 运行测试
console.log('🚀 Starting extended OAuth test...');
console.log('Note: This test gives you 10 minutes to complete browser authentication');
testToolCallingExtendedWait();