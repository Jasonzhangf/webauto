import { QwenProvider } from './src/providers/qwen';
import { BaseProvider } from './src/framework/BaseProvider';

// Simple test to verify TypeScript implementation
async function testTypeScriptImplementation() {
  console.log('🧪 Testing TypeScript Implementation...');
  
  try {
    // Test Qwen provider instantiation
    const qwenProvider = new QwenProvider({
      name: 'qwen',
      endpoint: 'https://chat.qwen.ai/api/v1/chat/completions',
      supportedModels: ['qwen-max', 'qwen-turbo'],
      defaultModel: 'qwen-turbo',
      tokenStoragePath: '/tmp/test-token.json'
    });
    
    console.log('✅ QwenProvider instantiated successfully');
    console.log(`Provider name: ${qwenProvider.name}`);
    console.log(`Provider endpoint: ${qwenProvider.endpoint}`);
    console.log(`Default model: ${qwenProvider.defaultModel}`);
    
    // Test BaseProvider functionality
    const providerInfo = qwenProvider.getInfo();
    console.log('✅ Provider info retrieved:', providerInfo);
    
    // Test health check
    const healthStatus = await qwenProvider.healthCheck();
    console.log('✅ Health check passed:', healthStatus);
    
    console.log('🎉 TypeScript implementation test passed!');
    
  } catch (error) {
    console.error('❌ TypeScript implementation test failed:', error);
    throw error;
  }
}

// Run the test
testTypeScriptImplementation().catch(console.error);