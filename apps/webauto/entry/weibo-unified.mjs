#!/usr/bin/env node
import minimist from 'minimist';
import { runWorkflowById } from '../../../dist/modules/workflow/src/runner.js';
import { pathToFileURL } from 'node:url';

const WEIBO_HOME_URL = 'https://www.weibo.com';
const DEFAULT_PROFILE = 'profile-0';

async function runCommand(argv) {
  const profile = String(argv.profile || DEFAULT_PROFILE).trim();
  if (!profile) {
    throw new Error('Profile ID is required. Use --profile <id>');
  }

  const workflowId = String(argv.workflow || '').trim();
  const keyword = String(argv.keyword || '').trim();
  const targetCount = Number(argv['max-notes'] || argv.target || 50);
  const maxComments = Number(argv['max-comments'] || 0); // 0 means no limit

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
    // Add other common parameters as needed
  };

  if (!workflowId) {
    throw new Error('Workflow ID is required. e.g., --workflow weibo-search-v1');
  }

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
      profile: DEFAULT_PROFILE,
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
  --profile <id>      Camo profile ID to use (default: ${DEFAULT_PROFILE})
  --keyword <text>    Keyword to search for (required for search command)
  --target <n>        Target number of posts to collect (default: 50)
  --max-comments <n>  Maximum comments to collect per post (default: 0, no limit)
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
  const workflowId = String(argv.workflow || 'weibo-search-v1').trim();
  const keyword = String(argv.keyword || argv.k || '').trim();
  const profile = String(argv.profile || DEFAULT_PROFILE).trim();
  const targetCount = Number(argv['max-notes'] || argv.target || argv['max-notes'] || 50);
  const maxComments = Number(argv['max-comments'] || 0);
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
  };

  const result = await runWorkflowById(workflowId, initialContext);

  return {
    ok: result.success,
    runId: `weibo-${Date.now()}`,
    summaryPath: null,
    error: result.error,
  };
}
