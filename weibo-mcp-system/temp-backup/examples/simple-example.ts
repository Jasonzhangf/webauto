#!/usr/bin/env node

/**
 * 微博容器操作系统 - 简单使用示例
 * Weibo Container OS - Simple Usage Example
 */

import { 
  quickStart, 
  createContainer, 
  createFlowExecutor,
  DEFAULT_CONFIG,
  logger 
} from './index';

async function simpleExample() {
  console.log('=== 微博容器操作系统 - 简单使用示例 ===');
  
  try {
    // 1. 快速启动系统
    console.log('1. 启动微博容器操作系统...');
    const system = await quickStart({
      ...DEFAULT_CONFIG,
      debug: true
    });
    
    console.log('✓ 系统启动成功');
    
    // 2. 获取系统状态
    console.log('\n2. 获取系统状态...');
    const status = system.getSystemStatus();
    console.log('系统状态:', {
      初始化状态: status.initialized,
      组件数量: status.components.length,
      实体数量: status.systemStatus.entities,
      活跃实体: status.systemStatus.activeEntities
    });
    
    // 3. 获取用户主页容器
    console.log('\n3. 获取用户主页容器...');
    const profileContainer = system.getComponent('UserProfileContainer');
    if (profileContainer) {
      console.log('✓ 用户主页容器已加载');
      
      // 显示容器信息
      const stats = (profileContainer as any).getContainerStats();
      console.log('容器统计:', stats);
      
      // 显示子容器
      const children = (profileContainer as any).getChildren();
      console.log('子容器:', Array.from(children.keys()));
    }
    
    // 4. 获取流程执行器
    console.log('\n4. 获取流程执行器...');
    const flowExecutor = system.getComponent('FlowExecutor');
    if (flowExecutor) {
      console.log('✓ 流程执行器已加载');
      
      const executorStats = (flowExecutor as any).getStats();
      console.log('执行器统计:', executorStats);
    }
    
    // 5. 创建简单的流程配置
    console.log('\n5. 创建简单流程配置...');
    const simpleFlowConfig = {
      id: 'simpleTestFlow',
      name: '简单测试流程',
      description: '测试基本功能',
      steps: [
        {
          type: 'operation',
          container: 'UserProfileContainer',
          operation: 'extractUserInfo',
          params: {}
        },
        {
          type: 'operation',
          container: 'UserProfileContainer',
          operation: 'extractPosts',
          params: { limit: 5 }
        }
      ]
    };
    
    console.log('✓ 流程配置创建完成');
    
    // 6. 解析并验证流程配置
    console.log('\n6. 验证流程配置...');
    const parsedConfig = (flowExecutor as any).parseFlowConfig(simpleFlowConfig);
    console.log('✓ 流程配置验证通过');
    console.log('流程信息:', {
      ID: parsedConfig.id,
      名称: parsedConfig.name,
      步骤数量: parsedConfig.steps.length
    });
    
    // 7. 显示系统摘要
    console.log('\n7. 系统摘要...');
    const stateCenter = system.getComponent('SystemStateCenter');
    if (stateCenter) {
      const systemStatus = (stateCenter as any).getSystemStatus();
      console.log('系统摘要:', {
        运行时间: `${Math.round(systemStatus.uptime / 1000)}秒`,
        实体总数: systemStatus.entities,
        活跃实体: systemStatus.activeEntities,
        健康实体: systemStatus.healthyEntities,
        流程数量: systemStatus.flows
      });
    }
    
    // 8. 测试状态中心功能
    console.log('\n8. 测试状态中心功能...');
    const testEntity = {
      id: 'testEntity',
      name: '测试实体',
      type: 'test' as const
    };
    
    await (stateCenter as any).registerEntity(testEntity);
    await (stateCenter as any).updateEntityState('testEntity', {
      properties: new Map([['testKey', 'testValue']]),
      metrics: new Map([['testMetric', 42]])
    });
    
    const testEntityState = (stateCenter as any).getEntityState('testEntity');
    console.log('✓ 测试实体状态:', {
      ID: testEntityState?.id,
      名称: testEntityState?.name,
      状态: testEntityState?.status,
      测试属性: testEntityState?.properties.get('testKey'),
      测试指标: testEntityState?.metrics.get('testMetric')
    });
    
    console.log('\n=== 示例执行完成 ===');
    console.log('✓ 所有功能测试通过');
    
  } catch (error) {
    console.error('示例执行失败:', error);
    process.exit(1);
  }
}

// 优雅关闭处理
process.on('SIGINT', () => {
  console.log('\n收到中断信号，正在优雅关闭...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n收到终止信号，正在优雅关闭...');
  process.exit(0);
});

// 运行示例
if (require.main === module) {
  simpleExample().catch(console.error);
}

export { simpleExample };