#!/usr/bin/env node

/**
 * 测试修复后的认证逻辑
 * Test Fixed Authentication Logic
 */

const { QwenProvider } = require('./dist/index');
const path = require('path');

async function testFixedAuth() {
  console.log('🔧 Testing Fixed Authentication Logic...\n');

  try {
    // 使用新的token文件名避免使用旧token
    const qwenProvider = new QwenProvider({
      name: 'qwen-fixed-test',
      endpoint: 'https://chat.qwen.ai/api/v1',
      supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-turbo',
      tokenStoragePath: path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-fixed-token.json')
    });

    console.log('1. Starting authentication...');
    const authResult = await qwenProvider.authenticate(true, { 
      interval: 10, 
      maxAttempts: 30 
    });
    
    if (authResult.success) {
      console.log('✅ Authentication successful!');
      
      // 检查token文件内容
      const fs = require('fs');
      const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE, '.webauto', 'auth', 'qwen-fixed-token.json');
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      
      console.log('\n📋 Saved Token Data:');
      console.log('  Access Token:', tokenData.accessToken.substring(0, 20) + '...');
      console.log('  Refresh Token:', tokenData.refreshToken.substring(0, 20) + '...');
      console.log('  Expires:', new Date(tokenData.tokenExpiry).toISOString());
      console.log('  Resource URL:', tokenData.resource_url || 'Not available');
      console.log('  Email:', tokenData.email || 'Not available');
      
      // 等待2秒确保token完全生效
      console.log('\n2. Waiting 2 seconds for token to activate...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 测试API调用 - 现在应该不会触发刷新
      console.log('\n3. Testing API call (should NOT trigger refresh)...');
      
      const testRequest = {
        model: 'qwen-turbo',
        messages: [
          {
            role: 'user',
            content: 'Hello'
          }
        ]
      };

      try {
        const response = await qwenProvider.chat(testRequest);
        console.log('✅ API call successful!');
        console.log('📝 Response:', response.choices?.[0]?.message?.content || 'No content');
        
      } catch (apiError) {
        console.log('❌ API call failed:', apiError.message);
        
        // 检查是否触发了刷新机制
        if (apiError.message.includes('refresh') || apiError.message.includes('re-authentication')) {
          console.log('🔍 ERROR: Refresh mechanism was triggered when it shouldn\'t be!');
          console.log('This indicates the logic fix didn\'t work.');
        } else {
          console.log('🔍 API failed but refresh logic worked correctly (no unnecessary refresh).');
        }
      }
      
    } else {
      console.log('❌ Authentication failed:', authResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

console.log('🚀 Starting fixed authentication logic test...\n');
testFixedAuth();