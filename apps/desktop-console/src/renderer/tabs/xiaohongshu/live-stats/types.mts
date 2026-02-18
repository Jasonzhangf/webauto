export type LiveStatsOptions = {
  maxCommentsInput: HTMLInputElement;
  linksStat: HTMLSpanElement;
  postsStat: HTMLSpanElement;
  commentsStat: HTMLSpanElement;
  likesStat: HTMLSpanElement;
  likesSkipStat: HTMLSpanElement;
  repliesStat: HTMLSpanElement;
  streamStat: HTMLSpanElement;
  shardStatsList: HTMLDivElement;
  likedList: HTMLDivElement;
  repliedList: HTMLDivElement;
};

export type LiveStatsController = {
  resetLiveStats: () => void;
  setExpectedLinksTarget: (target: number) => void;
  setShardProfiles: (profiles: string[]) => void;
  parseStdoutForEvents: (line: string) => void;
  setActiveRunId: (runId: string) => void;
  dispose: () => void;
};

export type NoteActionItem = {
  count: number;
  path: string;
};

export type ShardProgress = {
  linksCollected: number;
  linksTarget: number;
  postsProcessed: number;
  commentsCollected: number;
  likesTotal: number;
  likesSkippedTotal: number;
  likeDedupSkipped: number;
  likeAlreadySkipped: number;
  likeGateBlocked: number;
  repliesTotal: number;
  phase: string;
  action: string;
  status: 'idle' | 'running' | 'error' | 'completed';
  anomaly: string;
  updatedAt: number;
};

export type LiveStatsData = {
  linksCollected: number;
  linksTarget: number;
  postsProcessed: number;
  currentCommentsCollected: number;
  currentCommentsTarget: string;
  likesTotal: number;
  likesSkippedTotal: number;
  likeDedupSkipped: number;
  likeAlreadySkipped: number;
  likeGateBlocked: number;
  repliesTotal: number;
  eventsPath: string;
  noteId: string;
};

export type LiveStatsRuntime = {
  maxCommentsInput: HTMLInputElement;
  liveStats: LiveStatsData;
  activeRunIds: Set<string>;
  runToShard: Map<string, string>;
  parentRunCurrentShard: Map<string, string>;
  shardStats: Map<string, ShardProgress>;
  expectedShardProfiles: Set<string>;
  likedNotes: Map<string, NoteActionItem>;
  repliedNotes: Map<string, NoteActionItem>;
  activeRunId: string;
  hasStateFeed: boolean;
  ensureShardStats: (shardKey: string) => ShardProgress | null;
  formatLineText: (input: string, max?: number) => string;
  parentDir: (inputPath: string) => string;
  renderLiveStats: () => void;
};
