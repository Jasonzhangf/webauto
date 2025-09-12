#!/usr/bin/env node

/**
 * Simple OAuth Test - Get User Code Only
 * 简单OAuth测试 - 仅获取用户码
 */

const { QwenProvider } = require('./src/index');

async function getUserCodeOnly() {
  console.log('🔐 Qwen OAuth - Get User Code\n');

  try {
    const qwenProvider = new QwenProvider();
    
    console.log('🚀 Getting device code for authorization...');
    
    // 仅启动设备流程，不自动打开浏览器
    const deviceFlow = await qwenProvider.initiateDeviceFlow(false);
    
    console.log('✅ Device code generated!');
    console.log('\n📋 Authorization Information:');
    console.log(`  User Code: ${deviceFlow.userCode}`);
    console.log(`  Verification URI: ${deviceFlow.verificationUriComplete}`);
    console.log(`  Expires in: ${deviceFlow.expiresIn} seconds`);
    console.log(`  Polling Interval: ${deviceFlow.interval} seconds\n`);
    
    console.log('📝 Instructions:');
    console.log('  1. Copy the User Code above');
    console.log('  2. Visit the Verification URI');
    console.log('  3. Enter the User Code when prompted');
    console.log('  4. Log in and authorize the application\n');
    
    console.log('⏳ This script will NOT wait for authorization.');
    console.log('   Use the complete test script when ready to proceed.\n');
    
    return {
      success: true,
      userCode: deviceFlow.userCode,
      verificationUri: deviceFlow.verificationUriComplete,
      deviceCode: deviceFlow.deviceCode,
      pkceVerifier: deviceFlow.pkceVerifier,
      expiresIn: deviceFlow.expiresIn
    };
    
  } catch (error) {
    console.error('❌ Failed to get device code:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 运行测试
if (require.main === module) {
  getUserCodeOnly().then(result => {
    if (result.success) {
      console.log('🎉 Device code obtained successfully!');
      console.log('\n💡 Tip: Save this information for manual authorization testing');
    } else {
      console.log('💔 Failed to get device code.');
      process.exit(1);
    }
  }).catch(console.error);
}

module.exports = getUserCodeOnly;