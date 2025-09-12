#!/usr/bin/env node

/**
 * Qwen OAuth Complete Authentication Test
 * Qwen OAuth完整认证测试（包括浏览器自动打开和等待授权）
 */

const { QwenProvider } = require('./src/index');

async function testCompleteOAuthFlow() {
  console.log('🔐 Qwen OAuth Complete Authentication Test\n');

  try {
    // 创建Qwen Provider实例
    const qwenProvider = new QwenProvider();
    
    console.log('📋 Provider Configuration:');
    console.log(`  Provider: ${qwenProvider.name}`);
    console.log(`  Endpoint: ${qwenProvider.endpoint}`);
    console.log(`  Default Model: ${qwenProvider.defaultModel}\n`);
    
    console.log('⚠️  IMPORTANT: This test will perform a complete OAuth authentication.');
    console.log('   A browser window will open automatically.');
    console.log('   You will need to:');
    console.log('   1. Log in to your Qwen account in the browser');
    console.log('   2. Authorize the application');
    console.log('   3. Wait for the authentication to complete\n');
    
    // 询问用户是否继续
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const shouldContinue = await new Promise(resolve => {
      rl.question('Do you want to continue with OAuth authentication? (y/N): ', answer => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
    
    if (!shouldContinue) {
      console.log('🛑 Authentication test cancelled by user.');
      return;
    }
    
    console.log('\n🚀 Starting OAuth authentication...\n');
    
    // 执行完整的认证流程
    const result = await qwenProvider.authenticate(true, {
      maxAttempts: 120, // 增加最大尝试次数
      interval: 3       // 减少轮询间隔
    });
    
    if (result.success) {
      console.log('\n🎉 Authentication successful!');
      console.log('📊 Authentication Details:');
      console.log(`  Provider: ${result.provider}`);
      console.log(`  Timestamp: ${result.timestamp}`);
      console.log(`  Access Token: ${result.tokens.accessToken.slice(0, 30)}...`);
      console.log(`  Refresh Token: ${result.tokens.refreshToken ? result.tokens.refreshToken.slice(0, 30) + '...' : 'N/A'}`);
      console.log(`  Expires In: ${result.tokens.expiresIn} seconds`);
      
      // 测试API连接
      console.log('\n🔗 Testing API connection...');
      const health = await qwenProvider.healthCheck();
      
      if (health.status === 'healthy') {
        console.log('✅ API connection test passed!');
        console.log(`  Available models: ${health.models}`);
      } else {
        console.log(`⚠️  API connection test: ${health.status}`);
        console.log(`  Message: ${health.message}`);
      }
      
      // 测试获取模型列表
      console.log('\n📋 Testing model listing...');
      try {
        const models = await qwenProvider.getModels();
        console.log(`✅ Found ${models.length} models:`);
        models.forEach(model => {
          console.log(`  • ${model.id}: ${model.name || model.id}`);
        });
      } catch (error) {
        console.log(`⚠️  Model listing failed: ${error.message}`);
      }
      
      console.log('\n🎯 Ready to send chat requests!');
      
      // 可选：发送测试消息
      const sendTest = await new Promise(resolve => {
        const rl2 = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl2.question('\nWould you like to send a test chat message? (y/N): ', answer => {
          rl2.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });
      
      if (sendTest) {
        console.log('\n💬 Sending test message...');
        try {
          const testResponse = await qwenProvider.chat({
            model: 'qwen3-coder-flash',
            messages: [
              { role: 'user', content: 'Hello! Please respond with a brief greeting.' }
            ],
            max_tokens: 50
          });
          
          console.log('✅ Test message sent successfully!');
          console.log('Response:');
          console.log(`  ID: ${testResponse.id}`);
          console.log(`  Model: ${testResponse.model}`);
          console.log(`  Content: ${testResponse.choices[0]?.message?.content?.slice(0, 100)}...`);
          
        } catch (error) {
          console.log(`❌ Test message failed: ${error.message}`);
        }
      }
      
    } else {
      console.log('\n❌ Authentication failed!');
      console.log(`Error: ${result.error}`);
      console.log(`Provider: ${result.provider}`);
      console.log(`Timestamp: ${result.timestamp}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testCompleteOAuthFlow().catch(console.error);
}

module.exports = testCompleteOAuthFlow;