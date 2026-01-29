import minimist from 'minimist';

export type XhsPhase = 'phase1' | 'phase2' | 'phase34';

export interface ParsedXhsCliArgs {
  normalizedArgs: string[];
  args: minimist.ParsedArgs;
  showHelp: boolean;
  showVersion: boolean;
  keyword: string;
  targetCount: number;
  linksCountArg: number;
  maxComments: number | null;
  env: string;
  sessionId: string;
  headless: boolean;
  dev: boolean;
  startAt: XhsPhase;
  stopAfter: XhsPhase;
}

export function normalizePhase(value: unknown): XhsPhase | null {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (v === '1' || v === 'phase1') return 'phase1';
  if (v === '2' || v === 'phase2') return 'phase2';
  if (v === '34' || v === 'phase34') return 'phase34';
  return null;
}

export function phaseOrder(phase: XhsPhase | null): number {
  if (phase === 'phase1') return 1;
  if (phase === 'phase2') return 2;
  if (phase === 'phase34') return 34;
  return 999;
}

export function parseXhsCliArgs(rawArgs: string[]): ParsedXhsCliArgs {
  const normalizedArgs: string[] = [];
  for (const arg of rawArgs) {
    if (arg === '-cn') {
      normalizedArgs.push('--cn');
      continue;
    }
    normalizedArgs.push(arg);
  }
  const args = minimist(normalizedArgs, {
    alias: {
      k: 'keyword',
      n: 'count',
      cn: 'commentCount',
    },
    boolean: ['headless', 'headful', 'help', 'h', 'version', 'v', 'dev'],
    default: {
      headless: true,
    },
  });

  const keywordFromFlag = typeof args.keyword === 'string' ? args.keyword.trim() : '';
  const keywordFromPos = typeof args._[0] === 'string' ? String(args._[0]).trim() : '';
  const keyword = keywordFromFlag || keywordFromPos;

  const requestedCountRaw = args.count ?? 100;
  const requestedCount = Number(requestedCountRaw);
  const targetCount = Number.isFinite(requestedCount) ? Math.floor(requestedCount) : Number.NaN;

  const linksCountArg = Number(args.linksCount || 0);

  const rawCommentCount = args.commentCount;
  const maxCommentsValue =
    typeof rawCommentCount === 'number' || typeof rawCommentCount === 'string'
      ? Number(rawCommentCount)
      : Number.NaN;
  const maxComments =
    Number.isFinite(maxCommentsValue) && maxCommentsValue > 0 ? Math.floor(maxCommentsValue) : null;

  const env = typeof args.env === 'string' && args.env.trim() ? String(args.env).trim() : 'prod';
  const sessionId =
    typeof args.sessionId === 'string' && args.sessionId.trim() ? String(args.sessionId).trim() : 'xiaohongshu_fresh';

  const headless = args.headful ? false : Boolean(args.headless);
  const dev = Boolean(args.dev);
  const startAt = normalizePhase(args.startAt) || 'phase1';
  const stopAfter = normalizePhase(args.stopAfter) || 'phase34';

  const showHelp = normalizedArgs.length === 0 || Boolean(args.help || args.h);
  const showVersion = Boolean(args.version || args.v);

  return {
    normalizedArgs,
    args,
    showHelp,
    showVersion,
    keyword,
    targetCount,
    linksCountArg,
    maxComments,
    env,
    sessionId,
    headless,
    dev,
    startAt,
    stopAfter,
  };
}
