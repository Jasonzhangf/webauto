#!/usr/bin/env node

/**
 * 简单的Qwen工具调用测试
 * Simple Qwen tool calling test
 */

const { QwenProvider } = require('./dist/index');
const path = require('path');

async function simpleToolTest() {
  console.log('🔧 Simple Qwen Tool Calling Test...\n');

  try {
    // 创建Qwen Provider实例
    console.log('1. Creating Qwen Provider...');
    const qwenProvider = new QwenProvider({
      name: 'qwen-simple-test',
      endpoint: 'https://chat.qwen.ai/api/v1/chat/completions',
      supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-turbo',
      tokenStoragePath: path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-token.json')
    });

    console.log('✅ Qwen Provider created successfully');

    // 简单的工具调用测试
    console.log('\n2. Testing simple tool calling...');
    
    const request = {
      model: 'qwen-turbo',
      messages: [
        {
          role: 'user',
          content: '你好，请告诉我现在的时间'
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_current_time',
            description: '获取当前时间',
            parameters: {
              type: 'object',
              properties: {
                timezone: {
                  type: 'string',
                  description: '时区，如 Asia/Shanghai'
                }
              }
            }
          }
        }
      ]
    };

    console.log('📤 Sending request with tool definition...');
    console.log('Tool defined: get_current_time');

    try {
      const response = await qwenProvider.chat(request);
      
      console.log('\n✅ Request completed successfully!');
      console.log('📊 Response status:', response.choices ? 'Has choices' : 'No choices');
      
      if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        console.log('📝 Message content:', choice.message?.content || 'No content');
        
        if (choice.message?.tool_calls) {
          console.log('\n🔧 Tool calls found:');
          choice.message.tool_calls.forEach((call, i) => {
            console.log(`  ${i+1}. ${call.function.name}(${JSON.stringify(call.function.arguments)})`);
          });
          console.log('\n✅ Tool calling is working!');
        } else {
          console.log('\n⚠️  No tool calls in response');
          console.log('This could mean:');
          console.log('  - Model doesn\'t think tool is needed for this request');
          console.log('  - Tool calling is supported but not invoked');
          console.log('  - Authentication issues');
        }
      }
      
      console.log('\n🎉 Test completed successfully!');
      
    } catch (error) {
      console.log('\n❌ Request failed:', error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Data:', error.response.data);
      }
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// 运行测试
simpleToolTest();