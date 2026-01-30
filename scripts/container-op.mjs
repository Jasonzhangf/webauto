#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 通用容器操作脚本（highlight / extract / click / navigate / scroll 等）
 *
 * 用法：
 *   node scripts/container-op.mjs <profile> <containerId> <operationId> [--config '{"key":"value"}']
 *
 * 示例：
 *   # 高亮某个容器
 *   node scripts/container-op.mjs xiaohongshu_fresh xiaohongshu_search.search_result_list highlight
 *
 *   # 对具体容器实例执行 extract（containerId 通常来自 debug-container-tree）
 *   node scripts/container-op.mjs xiaohongshu_fresh container-123 extract --config '{"fields":["title","detail_url"]}'
 */

const UNIFIED_API = 'http://127.0.0.1:7701';

function parseArgs(argv) {
  const args = [...argv];
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

async function httpPost(endpoint, body) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function controllerAction(action, payload) {
  const data = await httpPost('/v1/controller/action', { action, payload });
  return data.data ?? data;
}

function safeParseJson(text) {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`配置解析失败（不是合法 JSON）: ${text}`);
  }
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const profile = positional[0] || process.env.WEBAUTO_PROFILE || '';
  const containerId = positional[1] || '';
  const operationId = positional[2] || '';

  if (!profile || !containerId || !operationId) {
    console.error('用法: node scripts/container-op.mjs <profile> <containerId> <operationId> [--config \'{"key":"value"}\']');
    console.error('示例:');
    console.error('  node scripts/container-op.mjs xiaohongshu_fresh xiaohongshu_search.search_result_list highlight');
    console.error('  node scripts/container-op.mjs xiaohongshu_fresh container-123 extract --config \'{"fields":["title"]}\'');
    process.exit(1);
  }

  const config = safeParseJson(flags.config);

  console.log(`🔧 ContainerOp`);
  console.log(`   profile:     ${profile}`);
  console.log(`   containerId: ${containerId}`);
  console.log(`   operationId: ${operationId}`);
  if (config) {
    console.log(`   config:      ${JSON.stringify(config)}`);
  }

  try {
    const result = await controllerAction('container:operation', {
      containerId,
      operationId,
      config: config || {},
      sessionId: profile,
    });

    console.log('\n✅ 操作完成，返回：');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('\n❌ container-op 执行失败:', err?.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ container-op 异常:', err?.message || err);
  process.exit(1);
});

