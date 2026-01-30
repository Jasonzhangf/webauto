#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * DEPRECATED
 *
 * 该脚本历史上用于“直接指定详情页”做评论爬取测试，但包含多处不符合当前 WebAuto 规则的行为：
 * - 通过 JS 直接导航（location.href=...）
 * - 通过 DOM 方式 click/scroll（btn.click / scrollBy）
 *
 * 为避免误用导致风控/会话破坏，本脚本已禁用。
 *
 * 请使用 Workflow v3 全流程脚本：
 *   node scripts/run-xiaohongshu-workflow-v3.mjs --workflow xiaohongshu-collect-full-v3 --keyword "<kw>" --count <n> --env <env>
 */

console.error(
  [
    '[deprecated] scripts/deprecated/xiaohongshu-test-comments-direct.mjs is disabled.',
    'Use workflow v3 instead:',
    '  node scripts/run-xiaohongshu-workflow-v3.mjs --workflow xiaohongshu-collect-full-v3 --keyword \"<kw>\" --count <n> --env <env>',
  ].join('\n'),
);
process.exit(1);
