/**
 * Tool Calling Test
 * 工具调用测试 - 验证LMStudio和iFlow的工具调用功能
 */

// 使用本地framework路径进行测试
const path = require('path');
const frameworkPath = path.resolve(__dirname, '../../../../sharedmodule/openai-compatible-providers/src');
const { ProviderFramework } = require(path.join(frameworkPath, 'index.js'));
const fs = require('fs');

// 加载测试配置
const testConfig = require('../config/test.config.js');

// 工具定义 - 列出本地文件夹中的文件
const listFilesTool = {
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
    }
  }
};

// 工具执行函数
async function executeListFiles(directory, recursive = false) {
  try {
    const files = [];
    
    const scanDir = (dir, basePath = '') => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(basePath, item);
        const stats = fs.statSync(fullPath);
        
        files.push({
          name: item,
          path: relativePath,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime.toISOString()
        });
        
        if (stats.isDirectory() && recursive) {
          scanDir(fullPath, relativePath);
        }
      }
    };
    
    scanDir(directory);
    
    return {
      success: true,
      directory: directory,
      files: files,
      total_count: files.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      directory: directory
    };
  }
}

// 测试函数
async function testToolCalling() {
  console.log('🚀 开始测试工具调用功能...\n');
  
  // 创建框架实例
  const framework = new ProviderFramework({
    providerScanPaths: [
      './providers'
    ],
    compatibilityScanPaths: [
      './compatibility'
    ]
  });
  
  try {
    // 等待模块扫描完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 更新Provider配置
    console.log('🔧 配置Provider参数...');
    
    // 配置iFlow Provider
    const iFlowProvider = framework.getProvider('iFlowProvider');
    if (iFlowProvider) {
      iFlowProvider.apiKey = testConfig.iflow.apiKey;
      iFlowProvider.endpoint = testConfig.iflow.endpoint;
      iFlowProvider.supportedModels = testConfig.iflow.supportedModels;
      iFlowProvider.defaultModel = testConfig.iflow.defaultModel;
      console.log('✅ iFlow Provider已配置');
    }
    
    // 配置LMStudio Provider
    const lmstudioProvider = framework.getProvider('LMStudioProvider');
    if (lmstudioProvider) {
      lmstudioProvider.apiKey = testConfig.lmstudio.apiKey;
      lmstudioProvider.endpoint = testConfig.lmstudio.endpoint;
      lmstudioProvider.supportedModels = testConfig.lmstudio.supportedModels;
      lmstudioProvider.defaultModel = testConfig.lmstudio.defaultModel;
      console.log('✅ LMStudio Provider已配置');
    }
    
    // 获取所有Provider
    const providers = framework.getAllProviders();
    console.log('📋 可用的Provider:');
    Object.entries(providers).forEach(([name, info]) => {
      console.log(`  - ${name}: ${info.endpoint} (${info.supportedModels.join(', ')})`);
    });
    console.log('');
    
    // LMStudio测试请求
    const lmstudioTestRequest = {
      model: testConfig.lmstudio.defaultModel,
      messages: [
        {
          role: 'user',
          content: '请列出当前目录中的文件和文件夹，使用list_files工具，目录路径为"."'
        }
      ],
      tools: [listFilesTool],
      tool_choice: 'auto',
      temperature: 0.1
    };
    
    // iFlow测试请求
    const iflowTestRequest = {
      model: testConfig.iflow.defaultModel,
      messages: [
        {
          role: 'user',
          content: '请列出当前目录中的文件和文件夹，使用list_files工具，目录路径为"."'
        }
      ],
      tools: [listFilesTool],
      tool_choice: 'auto',
      temperature: 0.1
    };
    
    console.log('🔧 LMStudio测试请求配置:');
    console.log(JSON.stringify(lmstudioTestRequest, null, 2));
    console.log('');
    
    console.log('🔧 iFlow测试请求配置:');
    console.log(JSON.stringify(iflowTestRequest, null, 2));
    console.log('');
    
    // 测试LMStudio
    console.log('🧪 测试LMStudio Provider...');
    try {
      const lmstudioResponse = await framework.chat('LMStudioProvider', lmstudioTestRequest);
      console.log('✅ LMStudio 响应成功');
      console.log('响应:', JSON.stringify(lmstudioResponse, null, 2));
      
      // 检查是否包含工具调用
      if (lmstudioResponse.choices && lmstudioResponse.choices.length > 0) {
        const choice = lmstudioResponse.choices[0];
        if (choice.message && choice.message.tool_calls) {
          console.log('\n🔧 检测到工具调用:');
          for (const toolCall of choice.message.tool_calls) {
            console.log(`  工具: ${toolCall.function.name}`);
            console.log(`  参数: ${JSON.stringify(toolCall.function.arguments)}`);
            
            // 执行工具调用
            if (toolCall.function.name === 'list_files') {
              const args = JSON.parse(toolCall.function.arguments);
              const result = await executeListFiles(args.directory, args.recursive);
              console.log(`  执行结果: ${result.success ? '成功' : '失败'}`);
              if (result.success) {
                console.log(`  文件数量: ${result.total_count}`);
              } else {
                console.log(`  错误: ${result.error}`);
              }
            }
          }
        } else {
          console.log('⚠️  未检测到工具调用，模型返回了文本响应');
        }
      } else {
        console.log('⚠️  响应格式异常');
      }
      
    } catch (error) {
      console.log('❌ LMStudio 测试失败:', error.message);
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
    
    // 测试iFlow
    console.log('🧪 测试iFlow Provider...');
    try {
      const iflowResponse = await framework.chat('iFlowProvider', iflowTestRequest);
      console.log('✅ iFlow 响应成功');
      console.log('响应:', JSON.stringify(iflowResponse, null, 2));
      
      // 检查是否包含工具调用
      if (iflowResponse.choices && iflowResponse.choices.length > 0) {
        const choice = iflowResponse.choices[0];
        if (choice.message && choice.message.tool_calls) {
          console.log('\n🔧 检测到工具调用:');
          for (const toolCall of choice.message.tool_calls) {
            console.log(`  工具: ${toolCall.function.name}`);
            console.log(`  参数: ${JSON.stringify(toolCall.function.arguments)}`);
            
            // 执行工具调用
            if (toolCall.function.name === 'list_files') {
              const args = JSON.parse(toolCall.function.arguments);
              const result = await executeListFiles(args.directory, args.recursive);
              console.log(`  执行结果: ${result.success ? '成功' : '失败'}`);
              if (result.success) {
                console.log(`  文件数量: ${result.total_count}`);
              } else {
                console.log(`  错误: ${result.error}`);
              }
            }
          }
        } else {
          console.log('⚠️  未检测到工具调用，模型返回了文本响应');
        }
      } else {
        console.log('⚠️  响应格式异常');
      }
      
    } catch (error) {
      console.log('❌ iFlow 测试失败:', error.message);
    }
    
    // 健康检查
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('🏥 执行健康检查...');
    
    const health = await framework.healthCheck();
    console.log('健康检查结果:');
    console.log(JSON.stringify(health, null, 2));
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
    console.error('错误堆栈:', error.stack);
  }
}

// 运行测试
if (require.main === module) {
  testToolCalling().catch(console.error);
}

module.exports = {
  testToolCalling,
  listFilesTool,
  executeListFiles
};