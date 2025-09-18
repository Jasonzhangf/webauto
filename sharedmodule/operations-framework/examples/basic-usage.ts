/**
 * WebAuto Operator Framework - 基础使用示例
 * @package @webauto/operator-framework
 *
 * 演示如何使用各个操作子进行基本操作
 */

import { CookieOperator, CookieData } from '../operators/browser/CookieOperator';
import { NavigationOperator } from '../operators/browser/NavigationOperator';
import { ScrollOperator } from '../operators/browser/ScrollOperator';
import { ConditionOperator } from '../operators/control/ConditionOperator';
import { StateOperator } from '../operators/control/StateOperator';

async function basicUsageExample() {
  console.log('🎯 WebAuto Operator Framework - 基础使用示例');
  console.log('=' * 60);

  // 创建操作子实例
  const cookieOperator = new CookieOperator();
  const navigationOperator = new NavigationOperator();
  const scrollOperator = new ScrollOperator();
  const conditionOperator = new ConditionOperator();
  const stateOperator = new StateOperator();

  console.log('✅ 操作子实例创建完成');

  // 1. Cookie操作示例
  console.log('\n🍪 Cookie 操作示例:');

  // 设置一些测试Cookie
  const testCookies: CookieData[] = [
    {
      name: 'session_id',
      value: 'test_session_123',
      domain: 'weibo.com',
      path: '/',
      secure: true,
      httpOnly: true
    },
    {
      name: 'user_token',
      value: 'test_token_456',
      domain: 'weibo.com',
      path: '/',
      secure: true
    }
  ];

  const importResult = await cookieOperator.importCookies(testCookies);
  console.log(`   导入Cookie: ${importResult.success ? '成功' : '失败'}`);
  console.log(`   导入数量: ${importResult.data?.count || 0}`);

  // 列出Cookie
  const listResult = await cookieOperator.listCookies('weibo.com');
  console.log(`   列出Cookie: ${listResult.success ? '成功' : '失败'}`);
  console.log(`   Cookie数量: ${listResult.data?.count || 0}`);

  // 2. 导航操作示例
  console.log('\n🧭 导航操作示例:');

  const navigateResult = await navigationOperator.execute({
    action: 'navigate',
    url: 'https://weibo.com',
    waitUntil: 'networkidle'
  });
  console.log(`   导航到微博: ${navigateResult.success ? '成功' : '失败'}`);

  const currentUrlResult = await navigationOperator.execute({
    action: 'getCurrentUrl'
  });
  console.log(`   当前URL: ${currentUrlResult.data?.currentUrl || '未知'}`);

  // 3. 滚动操作示例
  console.log('\n📜 滚动操作示例:');

  const scrollToTopResult = await scrollOperator.execute({
    action: 'toTop',
    behavior: 'smooth'
  });
  console.log(`   滚动到顶部: ${scrollToTopResult.success ? '成功' : '失败'}`);

  const scrollByPixelsResult = await scrollOperator.execute({
    action: 'byPixels',
    x: 0,
    y: 500,
    behavior: 'smooth'
  });
  console.log(`   向下滚动500px: ${scrollByPixelsResult.success ? '成功' : '失败'}`);

  const scrollPositionResult = await scrollOperator.execute({
    action: 'getCurrentPosition'
  });
  console.log(`   当前滚动位置: ${JSON.stringify(scrollPositionResult.data?.position || {})}`);

  // 4. 条件操作示例
  console.log('\n🔍 条件操作示例:');

  const conditionResult = await conditionOperator.execute({
    expression: 'user_session',
    operator: 'exists',
    data: {
      user_session: 'active',
      user_role: 'admin'
    }
  });
  console.log(`   条件检查: ${conditionResult.success ? '成功' : '失败'}`);
  console.log(`   条件结果: ${conditionResult.data?.passed ? '通过' : '未通过'}`);

  const rangeResult = await conditionOperator.execute({
    action: 'checkRange',
    value: 75,
    min: 0,
    max: 100,
    inclusive: true
  });
  console.log(`   范围检查: ${rangeResult.success ? '成功' : '失败'}`);
  console.log(`   范围结果: ${rangeResult.data?.passed ? '通过' : '未通过'}`);

  // 5. 状态操作示例
  console.log('\n💾 状态操作示例:');

  const setStateResult = await stateOperator.execute({
    action: 'set',
    key: 'workflow.status',
    value: 'running',
    namespace: 'demo'
  });
  console.log(`   设置状态: ${setStateResult.success ? '成功' : '失败'}`);

  const getStateResult = await stateOperator.execute({
    action: 'get',
    key: 'workflow.status',
    namespace: 'demo'
  });
  console.log(`   获取状态: ${getStateResult.success ? '成功' : '失败'}`);
  console.log(`   状态值: ${getStateResult.data?.value}`);

  const incrementResult = await stateOperator.execute({
    action: 'increment',
    key: 'workflow.attempts',
    incrementBy: 1,
    namespace: 'demo'
  });
  console.log(`   递增状态: ${incrementResult.success ? '成功' : '失败'}`);
  console.log(`   新值: ${incrementResult.data?.newValue}`);

  // 6. 获取操作子统计信息
  console.log('\n📊 操作子统计信息:');

  const cookieStats = await cookieOperator.getStats();
  console.log(`   Cookie统计: ${JSON.stringify(cookieStats.data)}`);

  const conditionStats = await conditionOperator.getStats();
  console.log(`   条件统计: ${JSON.stringify(conditionStats.data)}`);

  const stateStats = await stateOperator.getStats();
  console.log(`   状态统计: ${JSON.stringify(stateStats.data)}`);

  console.log('\n✅ 基础使用示例完成');
}

// 异步操作示例
async function asyncOperationExample() {
  console.log('\n⚡ 异步操作示例:');
  console.log('=' * 40);

  const cookieOperator = new CookieOperator();
  const stateOperator = new StateOperator();

  // 启动异步Cookie保存
  const asyncOperationId = await cookieOperator.executeAsync({
    action: 'save',
    path: './async-cookies.json'
  });
  console.log(`   异步操作已启动: ${asyncOperationId}`);

  // 启动异步状态设置
  const asyncStateId = await stateOperator.executeAsync({
    action: 'set',
    key: 'async.test',
    value: 'async_value',
    namespace: 'demo'
  });
  console.log(`   异步状态设置已启动: ${asyncStateId}`);

  // 模拟等待异步操作完成
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 检查异步操作结果
  const cookieResult = await cookieOperator.getAsyncResult(asyncOperationId);
  console.log(`   Cookie操作结果: ${cookieResult.success ? '成功' : '失败'}`);

  const stateResult = await stateOperator.getAsyncResult(asyncStateId);
  console.log(`   状态操作结果: ${stateResult.success ? '成功' : '失败'}`);

  console.log('✅ 异步操作示例完成');
}

// 批量操作示例
async function batchOperationExample() {
  console.log('\n📦 批量操作示例:');
  console.log('=' * 40);

  const cookieOperator = new CookieOperator();

  // 批量Cookie操作
  const batchOperations = [
    {
      id: 'op1',
      params: {
        action: 'set' as const,
        key: 'batch_cookie_1',
        value: 'value_1',
        domain: 'test.com'
      }
    },
    {
      id: 'op2',
      params: {
        action: 'set' as const,
        key: 'batch_cookie_2',
        value: 'value_2',
        domain: 'test.com'
      }
    },
    {
      id: 'op3',
      params: {
        action: 'set' as const,
        key: 'batch_cookie_3',
        value: 'value_3',
        domain: 'test.com'
      }
    }
  ];

  const batchResult = await cookieOperator.executeBatch(batchOperations);
  console.log(`   批量操作: ${batchResult.success ? '成功' : '失败'}`);
  console.log(`   总操作数: ${batchResult.data?.total}`);
  console.log(`   成功数: ${batchResult.data?.successful}`);
  console.log(`   失败数: ${batchResult.data?.failed}`);

  console.log('✅ 批量操作示例完成');
}

// 导出示例函数
export { basicUsageExample, asyncOperationExample, batchOperationExample };

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
  (async () => {
    try {
      await basicUsageExample();
      await asyncOperationExample();
      await batchOperationExample();
      console.log('\n🎉 所有示例执行完成');
    } catch (error) {
      console.error('💥 示例执行失败:', error);
      process.exit(1);
    }
  })();
}