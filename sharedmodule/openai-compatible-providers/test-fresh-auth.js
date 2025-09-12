#!/usr/bin/env node

/**
 * 重新认证测试
 * Re-authentication Test
 */

const { QwenProvider } = require('./dist/index');
const path = require('path');

async function testFreshAuth() {
  console.log('🔄 Testing Fresh Authentication...\n');

  try {
    const qwenProvider = new QwenProvider({
      name: 'qwen-fresh-test',
      endpoint: 'https://chat.qwen.ai/api/v1',
      supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-turbo',
      tokenStoragePath: path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-fresh-token.json')
    });

    console.log('1. Starting fresh authentication...');
    const authResult = await qwenProvider.authenticate(true, { 
      interval: 10, 
      maxAttempts: 30 
    });
    
    if (authResult.success) {
      console.log('✅ Authentication successful!');
      
      // 立即测试API调用
      console.log('\n2. Testing API call immediately after auth...');
      
      const testRequest = {
        model: 'qwen-turbo',
        messages: [
          {
            role: 'user',
            content: 'Hello, this is a test'
          }
        ]
      };

      try {
        const response = await qwenProvider.chat(testRequest);
        console.log('✅ API call successful!');
        console.log('📝 Response:', response.choices?.[0]?.message?.content || 'No content');
        
      } catch (apiError) {
        console.log('❌ API call failed:', apiError.message);
        console.log('This confirms the OAuth token issue.');
      }
      
    } else {
      console.log('❌ Authentication failed:', authResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

console.log('🚀 Starting fresh authentication test...\n');
testFreshAuth();