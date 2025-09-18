/**
 * WebAuto Operator Framework - 演示工作流
 * @package @webauto/operator-framework
 *
 * 演示工作流：浏览器初始化 -> Cookie加载 -> 微博主页导航
 */

import { SimpleWorkflowEngine } from '../workflow/SimpleWorkflowEngine';
import { CookieOperator } from '../operators/browser/CookieOperator';
import { NavigationOperator } from '../operators/browser/NavigationOperator';
import { ConditionOperator } from '../operators/control/ConditionOperator';
import { StateOperator } from '../operators/control/StateOperator';
import { WorkflowConfig, WorkflowStepType } from '../workflow/types/WorkflowTypes';

async function createDemoWorkflow() {
  // 创建工作流引擎
  const workflowEngine = new SimpleWorkflowEngine();

  // 注册操作子
  const cookieOperator = new CookieOperator();
  const navigationOperator = new NavigationOperator();
  const conditionOperator = new ConditionOperator();
  const stateOperator = new StateOperator();

  workflowEngine.registerOperator(cookieOperator);
  workflowEngine.registerOperator(navigationOperator);
  workflowEngine.registerOperator(conditionOperator);
  workflowEngine.registerOperator(stateOperator);

  // 创建微博自动化演示工作流
  const weiboWorkflow: WorkflowConfig = {
    id: 'weibo-automation-demo',
    name: '微博自动化演示',
    description: '演示浏览器初始化、Cookie管理和页面导航的完整工作流',
    startStepId: 'init-state',
    stopOnError: true,
    maxRetries: 3,
    retryDelay: 2000,
    steps: [
      {
        id: 'init-state',
        name: '初始化工作流状态',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.status',
          value: 'initialized',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'load-cookies',
        timeout: 5000
      },
      {
        id: 'load-cookies',
        name: '加载微博Cookie',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'cookie-operator',
        params: {
          action: 'load',
          path: './cookies/weibo.json'
        },
        nextStepOnSuccess: 'check-cookies',
        nextStepOnFailure: 'handle-no-cookies',
        retryPolicy: {
          maxRetries: 2,
          retryDelay: 1000
        },
        timeout: 10000
      },
      {
        id: 'check-cookies',
        name: '检查Cookie是否有效',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'condition-operator',
        params: {
          action: 'evaluateMultipleConditions',
          conditions: [
            {
              expression: 'cookies.count',
              operator: 'greater_than',
              expectedValue: 0
            },
            {
              expression: 'cookies.loaded',
              operator: 'equals',
              expectedValue: true
            }
          ],
          logic: 'AND'
        },
        nextStepOnSuccess: 'update-state-ready',
        nextStepOnFailure: 'handle-invalid-cookies',
        timeout: 5000
      },
      {
        id: 'update-state-ready',
        name: '更新状态为就绪',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.status',
          value: 'cookies-ready',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'navigate-to-weibo',
        timeout: 5000
      },
      {
        id: 'navigate-to-weibo',
        name: '导航到微博主页',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'navigation-operator',
        params: {
          action: 'navigate',
          url: 'https://weibo.com',
          waitUntil: 'networkidle',
          timeout: 30000
        },
        nextStepOnSuccess: 'verify-navigation',
        nextStepOnFailure: 'handle-navigation-error',
        retryPolicy: {
          maxRetries: 3,
          retryDelay: 2000
        },
        timeout: 45000
      },
      {
        id: 'verify-navigation',
        name: '验证导航结果',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'condition-operator',
        params: {
          expression: 'navigated',
          operator: 'equals',
          expectedValue: true,
          data: {
            navigated: '${navigate-to-weibo.navigated}',
            url: '${navigate-to-weibo.url}'
          }
        },
        nextStepOnSuccess: 'update-state-success',
        nextStepOnFailure: 'handle-verification-error',
        timeout: 10000
      },
      {
        id: 'update-state-success',
        name: '更新状态为成功',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.status',
          value: 'completed',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'save-session-info',
        timeout: 5000
      },
      {
        id: 'save-session-info',
        name: '保存会话信息',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'session.info',
          value: {
            completedAt: Date.now(),
            finalUrl: '${navigate-to-weibo.url}',
            navigationResult: '${navigate-to-weibo}',
            workflowDuration: '${workflow.duration}'
          },
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'complete-workflow',
        timeout: 5000
      },
      {
        id: 'complete-workflow',
        name: '工作流完成',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'persist',
          path: './weibo-workflow-state.json'
        },
        timeout: 5000
      },
      // 错误处理步骤
      {
        id: 'handle-no-cookies',
        name: '处理Cookie文件不存在',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.error',
          value: 'Cookie文件不存在，需要手动登录',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'manual-login-required',
        timeout: 5000
      },
      {
        id: 'handle-invalid-cookies',
        name: '处理无效Cookie',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.error',
          value: 'Cookie无效或已过期，需要重新登录',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'manual-login-required',
        timeout: 5000
      },
      {
        id: 'handle-navigation-error',
        name: '处理导航错误',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.error',
          value: '导航到微博主页失败',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'error-cleanup',
        timeout: 5000
      },
      {
        id: 'handle-verification-error',
        name: '处理验证错误',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.error',
          value: '导航验证失败',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'error-cleanup',
        timeout: 5000
      },
      {
        id: 'manual-login-required',
        name: '需要手动登录',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'navigation-operator',
        params: {
          action: 'navigate',
          url: 'https://weibo.com/login.php',
          waitUntil: 'networkidle'
        },
        nextStepOnSuccess: 'wait-for-manual-login',
        timeout: 30000
      },
      {
        id: 'wait-for-manual-login',
        name: '等待手动登录',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.status',
          value: 'waiting-for-manual-login',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'cleanup',
        timeout: 5000
      },
      {
        id: 'error-cleanup',
        name: '错误清理',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'set',
          key: 'workflow.status',
          value: 'error',
          namespace: 'weibo-demo'
        },
        nextStepOnSuccess: 'cleanup',
        timeout: 5000
      },
      {
        id: 'cleanup',
        name: '清理资源',
        type: WorkflowStepType.OPERATOR,
        operatorId: 'state-operator',
        params: {
          action: 'persist',
          path: './weibo-workflow-state-error.json'
        },
        timeout: 5000
      }
    ]
  };

  // 注册工作流
  await workflowEngine.registerWorkflow(weiboWorkflow);

  // 添加工作流事件监听
  workflowEngine.on('workflow.started', (data) => {
    console.log(`🚀 工作流已启动: ${data.workflowId} (${data.sessionId})`);
  });

  workflowEngine.on('workflow.completed', (data) => {
    console.log(`✅ 工作流已完成: ${data.workflowId} (${data.sessionId})`);
    console.log(`   执行时间: ${data.data.executionTime}ms`);
    console.log(`   执行步骤: ${data.data.executedSteps.join(' -> ')}`);
  });

  workflowEngine.on('workflow.error', (data) => {
    console.log(`❌ 工作流执行失败: ${data.workflowId} (${data.sessionId})`);
    console.log(`   错误信息: ${data.data.error}`);
    console.log(`   执行时间: ${data.data.executionTime}ms`);
  });

  workflowEngine.on('step.started', (data) => {
    console.log(`🔧 开始执行步骤: ${data.data.stepId}`);
  });

  workflowEngine.on('step.completed', (data) => {
    const result = data.data.result;
    const status = result.success ? '✅' : '❌';
    console.log(`${status} 步骤完成: ${data.data.stepId} (${result.executionTime}ms)`);

    if (result.success && result.data) {
      console.log(`   结果: ${JSON.stringify(result.data, null, 2).substring(0, 200)}...`);
    }
  });

  workflowEngine.on('step.error', (data) => {
    console.log(`❌ 步骤失败: ${data.data.stepId} - ${data.data.error}`);
  });

  return {
    workflowEngine,
    weiboWorkflow,
    cookieOperator,
    navigationOperator,
    conditionOperator,
    stateOperator
  };
}

// 导出演示函数
export { createDemoWorkflow };

// 如果直接运行此文件，执行演示
if (require.main === module) {
  (async () => {
    try {
      console.log('🎯 WebAuto Operator Framework - 演示工作流');
      console.log('=' * 60);

      const { workflowEngine, weiboWorkflow } = await createDemoWorkflow();

      console.log('📋 工作流配置:');
      console.log(`   名称: ${weiboWorkflow.name}`);
      console.log(`   描述: ${weiboWorkflow.description}`);
      console.log(`   步骤数: ${weiboWorkflow.steps.length}`);
      console.log('');

      console.log('🚀 开始执行演示工作流...');
      console.log('');

      // 执行工作流
      const result = await workflowEngine.executeWorkflow('weibo-automation-demo', {
        startTime: Date.now(),
        environment: 'demo'
      });

      console.log('');
      console.log('📊 执行结果:');
      console.log(`   成功: ${result.success ? '是' : '否'}`);
      console.log(`   最终状态: ${result.finalState}`);
      console.log(`   执行时间: ${result.executionTime}ms`);
      console.log(`   执行步骤: ${result.executedSteps.length}`);

      if (!result.success) {
        console.log(`   错误信息: ${result.error}`);
      }

      console.log('');
      console.log('📈 工作流引擎统计:');
      const stats = workflowEngine.getStats();
      console.log(`   总工作流数: ${stats.totalWorkflows}`);
      console.log(`   成功工作流: ${stats.successfulWorkflows}`);
      console.log(`   失败工作流: ${stats.failedWorkflows}`);
      console.log(`   平均执行时间: ${Math.round(stats.averageExecutionTime)}ms`);
      console.log(`   平均步骤数: ${Math.round(stats.averageStepsPerWorkflow)}`);

    } catch (error) {
      console.error('💥 演示执行失败:', error);
      process.exit(1);
    }
  })();
}