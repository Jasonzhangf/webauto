#!/usr/bin/env node
import minimist from 'minimist';
import { runWorkflowById } from '../../../dist/modules/workflow/src/runner.js';
import { pathToFileURL } from 'node:url';
import { assertProfileUsable } from './lib/profile-policy.mjs';
import { syncWeiboAccountByProfile } from './lib/account-detect.mjs';
import { cleanupIncompleteProfiles } from './lib/account-store.mjs';
import { ensureSessionInitialized } from './lib/session-init.mjs';

const WEIBO_HOME_URL = 'https://www.weibo.com';
const DEFAULT_PROFILE = '';

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function parseIntFlag(value, fallback, min = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.floor(num));
}

async function ensureWeiboLoginValid(profileId) {
  const state = await syncWeiboAccountByProfile(profileId);
  const valid = state?.valid === true && Boolean(String(state?.accountId || '').trim());
  if (!valid) {
    const reason = String(state?.reason || state?.status || 'invalid').trim() || 'invalid';
    throw new Error(`weibo account invalid, login gate blocked: ${profileId} (${reason})`);
  }
  return state;
}

function resolveWeiboWorkflow(argv = {}) {
  const explicitWorkflow = String(argv.workflow || '').trim();
  if (explicitWorkflow) return explicitWorkflow;
  const taskType = String(argv['task-type'] || argv.taskType || 'search').trim().toLowerCase();
  if (!taskType || taskType === 'search') return 'weibo-search-v1';
  throw new Error(`unsupported weibo task-type: ${taskType} (currently only search)`);
}

async function runCommand(argv) {
  cleanupIncompleteProfiles();
  const profile = assertProfileUsable(String(argv.profile || DEFAULT_PROFILE).trim());
  if (!profile) {
    throw new Error('Profile ID is required. Use --profile <id>');
  }
  const initResult = await ensureSessionInitialized(profile, {
    url: WEIBO_HOME_URL,
    rootDir: process.cwd(),
    timeoutMs: 60000,
  });
  if (!initResult?.ok) {
    throw new Error(`weibo session init failed: ${initResult?.error || 'unknown_error'}`);
  }
  await ensureWeiboLoginValid(profile);

  const workflowId = resolveWeiboWorkflow(argv);
  const keyword = String(argv.keyword || '').trim();
  const targetCount = Number(argv['max-notes'] || argv.target || 50);
  const maxComments = Number(argv['max-comments'] || 0); // 0 means no limit
  const maxPages = Number(argv['max-pages'] || 10);
  const collectComments = parseBoolean(argv['collect-comments'], maxComments > 0);
  const tabCount = parseIntFlag(argv['tab-count'], 2, 1);
  const tabOpenDelayMs = parseIntFlag(argv['tab-open-delay'], 800, 0);

  if (!keyword && workflowId === 'weibo-search-v1') {
    throw new Error('Keyword is required for search tasks. Use --keyword <text>');
  }

  const env = String(argv.env || 'debug').trim();

  const initialContext = {
    sessionId: profile,
    keyword,
    env,
    targetCount,
    maxComments,
    maxPages,
    collectComments,
    tabCount,
    tabOpenDelayMs,
    // Add other common parameters as needed
  };

  console.log(`[Weibo Unified] Running workflow: ${workflowId} with profile: ${profile}`);
  const result = await runWorkflowById(workflowId, initialContext);

  if (result.success) {
    console.log(`[Weibo Unified] Workflow ${workflowId} completed successfully.`);
  } else {
    console.error(`[Weibo Unified] Workflow ${workflowId} failed: ${result.error}`);
    process.exit(1);
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['profile', 'keyword', 'env', 'workflow'],
    boolean: ['help'],
    alias: { k: 'keyword', t: 'target', h: 'help' },
    default: {
      env: 'debug',
      target: 50,
    },
  });

  if (argv.help) {
    console.log(`
Usage: webauto weibo <command> [options]

Commands:
  search          Perform a Weibo search task.

Options:
  --profile <id>      Camo profile ID to use (required; must be pre-created)
  --task-type <type>  当前仅支持 search
  --keyword <text>    Keyword to search for (required for search command)
  --target <n>        Target number of posts to collect (default: 50)
  --max-pages <n>     Maximum search result pages to scan for links (default: 10)
  --max-comments <n>  Maximum comments to collect per post (default: 0, no limit)
  --collect-comments <bool>  Whether to collect comments in content phase (default: auto by --max-comments)
  --tab-count <n>     Tab count for round-robin detail collection (default: 2)
  --tab-open-delay <ms> Delay after opening each extra tab (default: 800)
  --env <debug|prod>  Environment for data storage (default: debug)
  --help              Show this help message

Examples:
  webauto weibo search --keyword "AI" --target 100 --profile my-weibo-profile
  webauto weibo search --keyword "大模型" --env prod
`);
    return;
  }

  const command = argv._[0];

  switch (command) {
    case 'search':
      await runCommand({ ...argv, workflow: 'weibo-search-v1' });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExec) {
  main().catch((error) => {
    console.error('Error in Weibo Unified:', error.message);
    process.exit(1);
  });
}

export async function runWeiboUnified(argv) {
  cleanupIncompleteProfiles();
  const workflowId = resolveWeiboWorkflow(argv);
  const keyword = String(argv.keyword || argv.k || '').trim();
  const profile = assertProfileUsable(String(argv.profile || DEFAULT_PROFILE).trim());
  const initResult = await ensureSessionInitialized(profile, {
    url: WEIBO_HOME_URL,
    rootDir: process.cwd(),
    timeoutMs: 60000,
  });
  if (!initResult?.ok) {
    throw new Error(`weibo session init failed: ${initResult?.error || 'unknown_error'}`);
  }
  await ensureWeiboLoginValid(profile);
  const targetCount = Number(argv['max-notes'] || argv.target || argv['max-notes'] || 50);
  const maxComments = Number(argv['max-comments'] || 0);
  const maxPages = Number(argv['max-pages'] || 10);
  const collectComments = parseBoolean(argv['collect-comments'], maxComments > 0);
  const tabCount = parseIntFlag(argv['tab-count'], 2, 1);
  const tabOpenDelayMs = parseIntFlag(argv['tab-open-delay'], 800, 0);
  const env = String(argv.env || 'debug').trim();

  if (!keyword) {
    throw new Error('Keyword is required for Weibo search tasks. Use --keyword <text>');
  }

  const initialContext = {
    sessionId: profile,
    keyword,
    env,
    targetCount,
    maxComments,
    maxPages,
    collectComments,
    tabCount,
    tabOpenDelayMs,
  };

  const result = await runWorkflowById(workflowId, initialContext);

  return {
    ok: result.success,
    runId: `weibo-${Date.now()}`,
    summaryPath: null,
    error: result.error,
  };
}
