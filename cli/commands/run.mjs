/**
 * wa run - 一键执行命令
 * 
 * 搜索帖子 + 采集评论 + 点赞
 */
import { header, ok, fail, info, warn, json, progressBar } from '../lib/output.mjs';
import { loadConfig, getDefaults, configDir } from '../lib/config.mjs';
import { join } from 'path';
import { existsSync } from 'fs';

export async function runCommand(args, opts) {
  const parsed = parseArgs(args);
  if (parsed.help) { printHelp(); return; }
  
  // Validate required args
  if (!parsed.keyword) {
    fail('缺少必需参数: -k/--keyword <搜索关键字>');
    console.log('  运行 wa run -h 查看帮助');
    return;
  }
  
  // Load config
  const config = loadConfig();
  const defaults = getDefaults(config);
  
  // Merge options: CLI args > config defaults
  const options = {
    profile: parsed.profile || defaults.profile || 'default',
    keyword: parsed.keyword,
    maxNotes: parsed.maxNotes || defaults.maxNotes || 30,
    likeKeywords: parsed.likeKeywords || null,
    maxLikes: parsed.maxLikes || defaults.maxLikes || 5,
    doComments: parsed.noComments ? false : (defaults.doComments ?? true),
    doLikes: parsed.noLikes ? false : (defaults.doLikes ?? false),
    headless: parsed.headless ?? defaults.headless ?? false,
    env: parsed.env || defaults.env || 'debug',
    detach: parsed.detach || false,
    matchMode: 'any',
    matchMinHits: 1,
    persistComments: true,
    doImages: false,
    doOcr: false,
    doReply: false,
    tabCount: 4,
  };
  
  // Enable likes if like keywords provided
  if (options.likeKeywords && !options.noLikes) {
    options.doLikes = true;
  }
  
  header(`WebAuto Run`);
  info(`关键字: ${options.keyword}`);
  if (options.likeKeywords) info(`点赞关键字: ${options.likeKeywords}`);
  info(`帖子数: ${options.maxNotes}`);
  info(`Profile: ${options.profile}`);
  info(`环境: ${options.env}`);
  info(`模式: ${options.headless ? 'headless' : 'headful'}`);
  
  if (opts.json) {
    json({ action: 'run', options });
    return;
  }
  
  // Execute via daemon relay
  const { executeUnifiedRun } = await import('../lib/executor.mjs');
  await executeUnifiedRun(options);
}

function parseArgs(args) {
  const result = {
    help: false,
    keyword: null,
    maxNotes: null,
    likeKeywords: null,
    maxLikes: null,
    profile: null,
    headless: null,
    env: null,
    detach: false,
    noComments: false,
    noLikes: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h': case '--help':
        result.help = true; break;
      case '-k': case '--keyword':
        result.keyword = args[++i]; break;
      case '-n': case '--count':
        result.maxNotes = parseInt(args[++i], 10); break;
      case '-l': case '--like':
        result.likeKeywords = args[++i]; break;
      case '-p': case '--profile':
        result.profile = args[++i]; break;
      case '--max-likes':
        result.maxLikes = parseInt(args[++i], 10); break;
      case '--no-comments':
        result.noComments = true; break;
      case '--no-likes':
        result.noLikes = true; break;
      case '--headless':
        result.headless = true; break;
      case '--env':
        result.env = args[++i]; break;
      case '--detach':
        result.detach = true; break;
      case '--json':
        result.json = true; break;
    }
  }
  
  return result;
}

function printHelp() {
  console.log(`
用法: wa run -k <关键字> [选项]

必需:
  -k, --keyword <kw>      搜索关键字

选项:
  -l, --like <keywords>   点赞关键字（逗号分隔）
  -n, --count <n>         目标帖子数（默认 30）
  -p, --profile <id>      Profile ID（默认 default）
  --max-likes <n>         每帖最大点赞数（默认 5）
  --no-comments           不采集评论
  --no-likes              不点赞
  --headless              无头模式
  --env <name>            输出环境（默认 debug）
  --detach                后台运行
  --json                  JSON 输出
  -h, --help               显示帮助

示例:
  wa run -k "梅姨" -l "吓死了" -n 50
  wa run -k "春分养生" -n 10 --headless
  wa run -k "美食" -l "好吃,推荐" -n 100 --detach
  `);
}
