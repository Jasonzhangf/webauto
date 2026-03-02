export type DashboardLikedLink = {
  url: string;
  noteId: string | null;
  source: string;
  profileId: string | null;
  ts: string;
  count: number;
};

export type DashboardRecentError = {
  ts: string;
  source: string;
  message: string;
  details: string | null;
};

export type DashboardState = {
  logsExpanded: boolean;
  paused: boolean;
  commentsCount: number;
  likesCount: number;
  likesSkippedCount: number;
  likesAlreadyCount: number;
  likesDedupCount: number;
  startTime: number;
  stoppedAt: number | null;
  elapsedTimer: ReturnType<typeof setInterval> | null;
  statePollTimer: ReturnType<typeof setInterval> | null;
  accountLabelPollTimer: ReturnType<typeof setInterval> | null;
  unsubscribeState: (() => void) | null;
  unsubscribeCmd: (() => void) | null;
  unsubscribeBus: (() => void) | null;
  contextRun: any;
  contextStartedAtMs: number;
  activeRunId: string;
  activeProfileId: string;
  activeStatus: string;
  errorCountTotal: number;
  recentErrors: DashboardRecentError[];
  likedLinks: Map<string, DashboardLikedLink>;
  maxLogs: number;
  maxRecentErrors: number;
  maxLikedLinks: number;
  accountLabelByProfile: Map<string, string>;
  accountLabelRefreshInFlight: boolean;
  accountLabelRefreshedAt: number;
  accountLabelRefreshTtlMs: number;
  initialTaskId: string;
};
