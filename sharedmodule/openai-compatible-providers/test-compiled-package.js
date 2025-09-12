/**
 * Test the compiled TypeScript package
 * 测试编译后的TypeScript包
 */

const { QwenProvider, BaseProvider } = require('./dist/index.js');
const path = require('path');

async function testPackage() {
  console.log('Testing compiled OpenAI Compatible Providers package...');
  
  try {
    // Test QwenProvider instantiation
    console.log('\n1. Testing QwenProvider instantiation...');
    const qwenConfig = {
      name: 'qwen-test',
      endpoint: 'https://chat.qwen.ai/api/v1/chat/completions',
      supportedModels: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
      defaultModel: 'qwen-turbo',
      tokenStoragePath: path.join(__dirname, 'test-tokens.json')
    };
    
    const qwenProvider = new QwenProvider(qwenConfig);
    console.log('✓ QwenProvider created successfully');
    
    // Test provider info
    console.log('\n2. Testing provider info...');
    const providerInfo = qwenProvider.getProviderInfo();
    console.log('Provider Info:', {
      name: providerInfo.name,
      endpoint: providerInfo.endpoint,
      defaultModel: providerInfo.defaultModel,
      supportedModelsCount: providerInfo.supportedModels.length
    });
    console.log('✓ Provider info retrieved successfully');
    
    // Test capabilities
    console.log('\n3. Testing provider capabilities...');
    const capabilities = qwenProvider.getCapabilities();
    console.log('Capabilities:', capabilities);
    console.log('✓ Capabilities retrieved successfully');
    
    // Test package exports
    console.log('\n4. Testing package exports...');
    console.log('Available exports:', {
      QwenProvider: typeof QwenProvider,
      BaseProvider: typeof BaseProvider,
      packageVersion: require('./dist/index.js').version,
      packageName: require('./dist/index.js').name
    });
    console.log('✓ Package exports working correctly');
    
    console.log('\n🎉 All tests passed! The compiled package is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testPackage();