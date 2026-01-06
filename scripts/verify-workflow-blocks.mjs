/**
 * Workflow Blocks 验证测试
 */

import { execute as LoadContainerIndex } from '../modules/workflow/blocks/LoadContainerIndex.ts';
import { execute as StartBrowserService } from '../modules/workflow/blocks/StartBrowserService.ts';
import { execute as EnsureSession } from '../modules/workflow/blocks/EnsureSession.ts';

const TEST_REPORT = {
  timestamp: new Date().toISOString(),
  results: []
};

async function testBlock(name, fn, input) {
  try {
    const result = await fn(input);
    TEST_REPORT.results.push({
      block: name,
      input: JSON.stringify(input).slice(0, 100),
      success: !result.error,
      error: result.error,
      output: JSON.stringify(result).slice(0, 200)
    });
    console.log(`[PASS] ${name}`);
    return result;
  } catch (error) {
    TEST_REPORT.results.push({
      block: name,
      input: JSON.stringify(input).slice(0, 100),
      success: false,
      error: error.message
    });
    console.log(`[FAIL] ${name}: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('=== Workflow Blocks 验证测试 ===\n');

  const projectRoot = process.cwd();

  try {
    await testBlock('LoadContainerIndex', LoadContainerIndex, {
      containerIndexPath: `${projectRoot}/container-library.index.json`
    });

    await testBlock('StartBrowserService', StartBrowserService, {
      host: '127.0.0.1',
      port: 7704,
      wsPort: 8765
    });

    await testBlock('EnsureSession', EnsureSession, {
      profileId: 'weibo_fresh',
      url: 'https://weibo.com',
      serviceUrl: 'http://127.0.0.1:7704'
    });

  } catch (error) {
    console.error('\n=== 测试失败 ===');
  }

  console.log('\n=== 测试报告 ===');
  TEST_REPORT.results.forEach(r => {
    console.log(`${r.success ? 'PASS' : 'FAIL'} ${r.block}${r.error ? `: ${r.error}` : ''}`);
  });

  const passed = TEST_REPORT.results.filter(r => r.success).length;
  const failed = TEST_REPORT.results.filter(r => !r.success).length;
  console.log(`\n总计: ${passed} 通过, ${failed} 失败`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
