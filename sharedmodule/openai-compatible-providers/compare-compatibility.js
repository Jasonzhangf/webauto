#!/usr/bin/env node

/**
 * Compatibility JSON Comparison Tool
 * 比较qwen.json和iflow.json的兼容性
 */

const fs = require('fs');
const path = require('path');

async function compareCompatibilityFiles() {
  console.log('🔍 Comparing Qwen and iFlow Compatibility Files...\n');

  try {
    // Load both compatibility files
    const qwenPath = path.join(__dirname, 'compatibility', 'qwen.json');
    const iflowPath = '/Users/fanzhang/Documents/github/webauto/openai-compatible-providers/src/framework/config/iflow-compatibility.config.json';
    
    if (!fs.existsSync(qwenPath)) {
      console.log('❌ Qwen compatibility file not found:', qwenPath);
      return;
    }
    
    if (!fs.existsSync(iflowPath)) {
      console.log('❌ iFlow compatibility file not found:', iflowPath);
      return;
    }
    
    const qwenData = JSON.parse(fs.readFileSync(qwenPath, 'utf8'));
    const iflowData = JSON.parse(fs.readFileSync(iflowPath, 'utf8'));
    
    console.log('📊 Basic Information:');
    console.log(`   Qwen Provider: ${qwenData.provider} v${qwenData.version}`);
    console.log(`   iFlow Provider: ${iflowData.provider.name} v${iflowData.provider.version}`);
    console.log('');
    
    // Compare structure and key sections
    console.log('🏗️  Structure Comparison:');
    
    // 1. Authentication
    console.log('🔐 Authentication:');
    if (qwenData.authentication) {
      console.log('   Qwen: ✅ OAuth 2.0 Device Flow');
      console.log(`        Client ID: ${qwenData.authentication.configuration.client_id}`);
      console.log(`        Flow: ${qwenData.authentication.flow}`);
    } else {
      console.log('   Qwen: ❌ No authentication section');
    }
    
    if (iflowData.provider.apiEndpoint) {
      console.log('   iFlow: ✅ API Key based');
      console.log(`        Endpoint: ${iflowData.provider.apiEndpoint}`);
      console.log('        Authentication: API Key in headers');
    } else {
      console.log('   iFlow: ❌ No authentication info');
    }
    console.log('');
    
    // 2. API Configuration
    console.log('🌐 API Configuration:');
    if (qwenData.api) {
      console.log('   Qwen:');
      console.log(`        Base URL: ${qwenData.api.base_url}`);
      console.log(`        Timeout: ${qwenData.api.timeout}ms`);
      console.log(`        Endpoints: ${Object.keys(qwenData.api.endpoints).join(', ')}`);
    }
    
    if (iflowData.provider.apiEndpoint) {
      console.log('   iFlow:');
      console.log(`        Base URL: ${iflowData.provider.apiEndpoint.replace('/chat/completions', '')}`);
      console.log('        Timeout: Not specified in config');
      console.log('        Endpoints: chat/completions (inferred)');
    }
    console.log('');
    
    // 3. Models
    console.log('🤖 Models:');
    console.log(`   Qwen: ${qwenData.models?.length || 0} models`);
    qwenData.models?.forEach((model, index) => {
      console.log(`        ${index + 1}. ${model.id} - ${model.name}`);
      console.log(`           Capabilities: ${Object.keys(model.capabilities).filter(k => model.capabilities[k]).join(', ')}`);
    });
    
    console.log(`   iFlow: ${iflowData.requestMappings.validation.model.allowedValues?.length || 0} models`);
    iflowData.requestMappings.validation.model.allowedValues?.forEach((model, index) => {
      console.log(`        ${index + 1}. ${model}`);
    });
    console.log('');
    
    // 4. Feature Compatibility
    console.log('🚀 Feature Compatibility:');
    
    const qwenFeatures = qwenData.features || {};
    const iflowSpecialRules = iflowData.specialRules || {};
    
    const featureComparison = [
      {
        name: 'Tool Calling',
        qwen: qwenFeatures.function_calling || false,
        iflow: iflowSpecialRules.toolCalling?.supported || false,
        details: {
          qwen: 'Function calling support',
          iflow: `Max tools: ${iflowSpecialRules.toolCalling?.maxTools || 'unknown'}, Parallel: ${iflowSpecialRules.toolCalling?.parallelCalls || 'unknown'}`
        }
      },
      {
        name: 'Streaming',
        qwen: qwenFeatures.streaming || false,
        iflow: iflowSpecialRules.streaming?.supported || false,
        details: {
          qwen: 'Streaming support',
          iflow: `Format: ${iflowSpecialRules.streaming?.format || 'unknown'}`
        }
      },
      {
        name: 'OAuth Support',
        qwen: qwenFeatures.oauth_device_flow || false,
        iflow: false, // iFlow uses API keys
        details: {
          qwen: 'Device code flow with PKCE',
          iflow: 'API key authentication'
        }
      },
      {
        name: 'Token Refresh',
        qwen: qwenFeatures.token_refresh || false,
        iflow: false,
        details: {
          qwen: 'Automatic token refresh',
          iflow: 'Manual API key management'
        }
      },
      {
        name: 'Model Discovery',
        qwen: qwenFeatures.model_discovery || false,
        iflow: true, // Has model list in validation
        details: {
          qwen: 'Dynamic model listing',
          iflow: 'Static model validation list'
        }
      }
    ];
    
    featureComparison.forEach(feature => {
      const qwenStatus = feature.qwen ? '✅' : '❌';
      const iflowStatus = feature.iflow ? '✅' : '❌';
      const compatibilityStatus = feature.qwen === feature.iflow ? '⚖️' : '⚠️';
      
      console.log(`   ${feature.name}:`);
      console.log(`        Qwen: ${qwenStatus} ${feature.details.qwen}`);
      console.log(`        iFlow: ${iflowStatus} ${feature.details.iflow}`);
      console.log(`        Compatibility: ${compatibilityStatus}`);
      console.log('');
    });
    
    // 5. Request/Response Mapping
    console.log('📡 Request/Response Mapping:');
    console.log('   Qwen: Direct OpenAI-compatible format');
    console.log('   iFlow: Comprehensive mapping system with:');
    console.log('        - Direct field mappings');
    console.log('        - Transform functions');
    console.log('        - Default values');
    console.log('        - Validation rules');
    console.log('        - Error mappings');
    console.log('');
    
    // 6. Compatibility Analysis
    console.log('📈 Compatibility Analysis:');
    
    const compatibleFeatures = featureComparison.filter(f => f.qwen && f.iflow).length;
    const totalFeatures = featureComparison.length;
    const compatibilityPercentage = Math.round((compatibleFeatures / totalFeatures) * 100);
    
    console.log(`   Overall Feature Compatibility: ${compatibilityPercentage}% (${compatibleFeatures}/${totalFeatures})`);
    
    // Model overlap analysis
    const qwenModelIds = new Set(qwenData.models?.map(m => m.id) || []);
    const iflowModelIds = new Set(iflowData.requestMappings.validation.model.allowedValues || []);
    const commonModels = [...qwenModelIds].filter(id => iflowModelIds.has(id));
    
    console.log(`   Model Overlap: ${commonModels.length} common models`);
    if (commonModels.length > 0) {
      console.log(`        Common models: ${commonModels.join(', ')}`);
    }
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    
    if (compatibilityPercentage < 80) {
      console.log('   ⚠️  Low compatibility - consider different integration approach');
    } else if (compatibilityPercentage < 100) {
      console.log('   ⚠️  Partial compatibility - may need feature-specific handling');
    } else {
      console.log('   ✅ High compatibility - good candidate for unified interface');
    }
    
    if (commonModels.length > 0) {
      console.log('   🎯 Model overlap suggests potential for unified model selection');
    }
    
    console.log('   🔧 Consider abstracting authentication differences');
    console.log('   📋 Standardize request/response mapping approach');
    
    console.log('\n🎉 Comparison Complete!');
    
  } catch (error) {
    console.error('❌ Comparison failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// 运行比较
if (require.main === module) {
  compareCompatibilityFiles().then(() => {
    console.log('\n✅ Compatibility comparison completed!');
  }).catch(console.error);
}

module.exports = compareCompatibilityFiles;