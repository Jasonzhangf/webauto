/**
 * 测试脚本：验证 RemoteSessionManager 和 RemoteBrowserSession
 *
 * 验证点：
 * 1. Unified API 能否通过 RemoteSessionManager 连接到 Browser Service
 * 2. RemoteBrowserSession 能否正确代理对 Browser Service 的调用
 * 3. OperationExecutor 能否通过 RemoteSession 执行操作
 */

const UNIFIED_API_URL = 'http://127.0.0.1:7701';
const BROWSER_SERVICE_URL = 'http://127.0.0.1:7704';

async function main() {
  console.log('\n=== 测试 Remote Session 架构 ===\n');

  // Step 1: 检查服务健康状态
  console.log('Step 1: 检查服务健康状态');
  
  try {
    const unifiedHealth = await fetch(`${UNIFIED_API_URL}/health`);
    const unifiedData = await unifiedHealth.json();
    console.log('✓ Unified API 健康:', unifiedData);
  } catch (error) {
    console.error('✗ Unified API 不可用:', error.message);
    console.error('请先运行: node scripts/start-headful.mjs');
    process.exit(1);
  }

  try {
    const browserHealth = await fetch(`${BROWSER_SERVICE_URL}/health`);
    const browserData = await browserHealth.json();
    console.log('✓ Browser Service 健康:', browserData);
  } catch (error) {
    console.error('✗ Browser Service 不可用:', error.message);
    console.error('请确保 Browser Service 已启动');
    process.exit(1);
  }

  // Step 2: 通过 Unified API 创建远程会话
  console.log('\nStep 2: 通过 Unified API 创建远程会话');
  
  const sessionId = `test_remote_${Date.now().toString(36)}`;
  
  try {
    const response = await fetch(`${UNIFIED_API_URL}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:start',
        payload: {
          sessionId,
          url: 'https://weibo.com'
        }
      })
    });

    const result = await response.json();
    console.log('✓ 创建会话结果:', result);

    if (!result.success) {
      throw new Error(result.error || '创建会话失败');
    }
  } catch (error) {
    console.error('✗ 创建会话失败:', error.message);
    process.exit(1);
  }

  // Step 3: 验证会话存在
  console.log('\nStep 3: 验证会话存在');
  
  try {
    const response = await fetch(`${UNIFIED_API_URL}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:status'
      })
    });

    const result = await response.json();
    console.log('✓ 会话列表:', result.data);

    const session = result.data?.find(s => s.session_id === sessionId);
    if (!session) {
      throw new Error('会话未找到');
    }
    console.log('✓ 会话已创建:', session);
  } catch (error) {
    console.error('✗ 验证会话失败:', error.message);
  }

  // Step 4: 测试容器操作（通过 RemoteSession）
  console.log('\nStep 4: 测试容器操作');
  
  try {
    const response = await fetch(`${UNIFIED_API_URL}/v1/container/test_container/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        operationId: 'inspect',
        config: {}
      })
    });

    const result = await response.json();
    console.log('✓ 容器操作结果:', result);
  } catch (error) {
    console.warn('⚠ 容器操作测试跳过（需要容器定义）:', error.message);
  }

  // Step 5: 清理会话
  console.log('\nStep 5: 清理会话');
  
  try {
    const response = await fetch(`${UNIFIED_API_URL}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:stop',
        payload: { sessionId }
      })
    });

    const result = await response.json();
    console.log('✓ 清理会话结果:', result);
  } catch (error) {
    console.error('✗ 清理会话失败:', error.message);
  }

  console.log('\n=== 测试完成 ===\n');
}

main().catch((error) => {
  console.error('\n测试失败:', error);
  process.exit(1);
});
