// 微博容器操作系统使用示例
import { WeiboSystemBootstrapper } from './core/weibo-system-bootstrapper';
import { UserProfileContainer } from './containers/user-profile-container';
import { FlowExecutor } from './flows/flow-executor';
import { SystemStateCenter } from './core/system-state-center';

// 示例1: 基本系统启动
async function basicSystemExample() {
  console.log('=== 基本系统启动示例 ===');
  
  try {
    // 创建启动器
    const bootstrapper = new WeiboSystemBootstrapper({
      debug: true,
      enableMetrics: true,
      enableHealthMonitoring: true
    });
    
    // 启动系统
    await bootstrapper.bootstrap();
    
    // 获取系统状态
    const status = bootstrapper.getSystemStatus();
    console.log('系统状态:', status);
    
    // 获取用户主页容器
    const userProfileContainer = bootstrapper.getComponent<UserProfileContainer>('UserProfileContainer');
    if (userProfileContainer) {
      console.log('用户主页容器已加载');
      
      // 点号访问示例
      const userProfile = userProfileContainer as any;
      if (userProfile.userProfile) {
        console.log('可以通过点号访问子容器:', userProfile.userProfile.name);
      }
      
      // 操作调用示例
      console.log('执行用户信息提取操作...');
      // const userInfo = await userProfileContainer.executeOperation('extractUserInfo');
      // console.log('用户信息:', userInfo);
    }
    
  } catch (error) {
    console.error('示例执行失败:', error);
  }
}

// 示例2: 流程执行示例
async function flowExecutionExample() {
  console.log('=== 流程执行示例 ===');
  
  try {
    // 获取流程执行器
    const flowExecutor = bootstrapper.getComponent<FlowExecutor>('FlowExecutor');
    
    if (flowExecutor) {
      // 定义用户主页信息提取流程
      const flowConfig = {
        id: 'userProfileFlow',
        name: '用户主页信息提取流程',
        description: '完整的用户主页信息提取流程',
        steps: [
          {
            type: 'operation',
            id: 'extractUserInfo',
            name: '提取用户信息',
            container: 'UserProfileContainer',
            operation: 'extractUserInfo',
            params: {}
          },
          {
            type: 'condition',
            id: 'checkHasPosts',
            name: '检查是否有微博',
            condition: {
              type: 'container_state',
              containerId: 'UserProfileContainer',
              property: 'elementCount',
              operator: 'greater_than',
              value: 0
            },
            trueBranch: {
              steps: [
                {
                  type: 'operation',
                  id: 'extractPosts',
                  name: '提取微博列表',
                  container: 'UserProfileContainer',
                  operation: 'extractPosts',
                  params: { limit: 20 }
                }
              ]
            },
            falseBranch: {
              steps: [
                {
                  type: 'log',
                  id: 'noPosts',
                  name: '记录无微博信息',
                  message: '用户没有足够的微博内容'
                }
              ]
            }
          },
          {
            type: 'loop',
            id: 'paginationLoop',
            name: '分页循环',
            loop: {
              type: 'while_has_more',
              maxIterations: 5
            },
            steps: [
              {
                type: 'operation',
                id: 'nextPage',
                name: '下一页',
                container: 'UserProfileContainer',
                operation: 'nextPage'
              },
              {
                type: 'condition',
                id: 'hasMorePages',
                name: '检查是否还有更多页',
                condition: {
                  type: 'container_state',
                  containerId: 'UserProfileContainer',
                  property: 'hasMore',
                  operator: 'equals',
                  value: true
                },
                trueBranch: {
                  steps: [
                    {
                      type: 'operation',
                      id: 'extractMorePosts',
                      name: '提取更多微博',
                      container: 'UserProfileContainer',
                      operation: 'extractPosts',
                      params: { limit: 20 }
                    }
                  ]
                }
              }
            ]
          }
        ]
      };
      
      // 执行流程
      console.log('开始执行流程...');
      const result = await flowExecutor.executeFlow(flowConfig);
      
      console.log('流程执行结果:', {
        success: result.success,
        resultsCount: result.results.length,
        duration: result.performance.duration
      });
      
    }
    
  } catch (error) {
    console.error('流程执行示例失败:', error);
  }
}

// 示例3: 状态中心监控示例
async function stateCenterExample() {
  console.log('=== 状态中心监控示例 ===');
  
  try {
    const stateCenter = SystemStateCenter.getInstance();
    
    // 获取系统状态
    const systemStatus = stateCenter.getSystemStatus();
    console.log('系统状态:', systemStatus);
    
    // 监听状态变化
    const subscriptionId = await stateCenter.subscribeToEntity('UserProfileContainer', {
      callback: async (newState, changes) => {
        console.log('用户主页容器状态变化:', {
          status: newState.status,
          changes: changes.changes
        });
      }
    });
    
    // 执行一些操作来触发状态变化
    const userProfileContainer = bootstrapper.getComponent<UserProfileContainer>('UserProfileContainer');
    if (userProfileContainer) {
      // 模拟状态更新
      await userProfileContainer.updateContainerState({
        properties: new Map([['testProperty', 'testValue']])
      });
    }
    
    // 等待一会儿观察状态变化
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 取消订阅
    await stateCenter.unsubscribeFromEntity('UserProfileContainer', subscriptionId);
    
  } catch (error) {
    console.error('状态中心示例失败:', error);
  }
}

// 示例4: 容器系统示例
async function containerSystemExample() {
  console.log('=== 容器系统示例 ===');
  
  try {
    const userProfileContainer = bootstrapper.getComponent<UserProfileContainer>('UserProfileContainer');
    
    if (userProfileContainer) {
      // 容器初始化
      await userProfileContainer.initialize();
      
      // 容器发现元素
      await userProfileContainer.discoverElements();
      
      // 获取容器状态
      const containerState = userProfileContainer.getContainerState();
      console.log('容器状态:', containerState);
      
      // 获取容器统计信息
      const stats = userProfileContainer.getContainerStats();
      console.log('容器统计:', stats);
      
      // 获取容器摘要信息
      const summary = userProfileContainer.getSummary();
      console.log('容器摘要:', summary);
      
      // 调试信息
      const debugInfo = await userProfileContainer.debugInfo();
      console.log('调试信息:', debugInfo);
    }
    
  } catch (error) {
    console.error('容器系统示例失败:', error);
  }
}

// 示例5: 并行执行示例
async function parallelExecutionExample() {
  console.log('=== 并行执行示例 ===');
  
  try {
    const flowExecutor = bootstrapper.getComponent<FlowExecutor>('FlowExecutor');
    
    if (flowExecutor) {
      const parallelFlowConfig = {
        id: 'parallelFlow',
        name: '并行执行流程',
        steps: [
          {
            type: 'parallel',
            id: 'parallelOperations',
            name: '并行操作',
            steps: [
              {
                type: 'operation',
                id: 'extractUserInfo1',
                container: 'UserProfileContainer',
                operation: 'extractUserInfo',
                params: {}
              },
              {
                type: 'operation',
                id: 'extractPosts1',
                container: 'UserProfileContainer',
                operation: 'extractPosts',
                params: { limit: 10 }
              },
              {
                type: 'operation',
                id: 'checkHasMore1',
                container: 'UserProfileContainer',
                operation: 'hasMore',
                params: {}
              }
            ]
          }
        ]
      };
      
      console.log('开始并行执行...');
      const result = await flowExecutor.executeFlow(parallelFlowConfig);
      
      console.log('并行执行结果:', {
        success: result.success,
        resultsCount: result.results.length,
        duration: result.performance.duration
      });
      
    }
    
  } catch (error) {
    console.error('并行执行示例失败:', error);
  }
}

// 全局变量
let bootstrapper: WeiboSystemBootstrapper;

// 主函数
async function main() {
  console.log('微博容器操作系统 - 使用示例');
  console.log('====================================');
  
  try {
    // 启动系统
    bootstrapper = new WeiboSystemBootstrapper({
      debug: true,
      enableMetrics: true,
      enableHealthMonitoring: true
    });
    
    await bootstrapper.bootstrap();
    
    // 运行各种示例
    await basicSystemExample();
    await flowExecutionExample();
    await stateCenterExample();
    await containerSystemExample();
    await parallelExecutionExample();
    
    console.log('所有示例执行完成');
    
  } catch (error) {
    console.error('示例执行失败:', error);
  } finally {
    // 清理资源
    if (bootstrapper) {
      await bootstrapper.shutdown();
    }
  }
}

// 错误处理
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', { reason, promise });
  process.exit(1);
});

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

export {
  basicSystemExample,
  flowExecutionExample,
  stateCenterExample,
  containerSystemExample,
  parallelExecutionExample
};