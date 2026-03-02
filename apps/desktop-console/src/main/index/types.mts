export type CmdEvent =
  | { type: 'started'; runId: string; title: string; pid: number; ts: number }
  | { type: 'stdout'; runId: string; line: string; ts: number }
  | { type: 'stderr'; runId: string; line: string; ts: number }
  | { type: 'exit'; runId: string; exitCode: number | null; signal: string | null; ts: number };

export type SpawnSpec = {
  title: string;
  cwd: string;
  args: string[];
  env?: Record<string, string>;
  groupKey?: string;
};

export type RunJsonSpec = {
  title: string;
  cwd: string;
  args: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
};
