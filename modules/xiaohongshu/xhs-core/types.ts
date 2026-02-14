// modules/xiaohongshu/xhs-core/types.ts
// Shared types for Xiaohongshu modules (re-export from unified-api)

import type { 
  TaskPhase,
  TaskStatus,
  TaskProgress,
  TaskStats,
  TaskError,
  TaskEvent,
  TaskState,
  StateUpdate
} from '../../../services/unified-api/task-state.js';

// Re-export all types from unified-api
export type {
  TaskPhase,
  TaskStatus,
  TaskProgress,
  TaskStats,
  TaskError,
  TaskEvent,
  TaskState,
  StateUpdate
};

// Xiaohongshu-specific types
export interface XhsCollectOptions {
  keyword: string;
  target: number;
  env: 'debug' | 'production';
  profileId: string;
  dryRun?: boolean;
  headless?: boolean;
  maxComments?: number;
  maxLikes?: number;
  likeKeywords?: string[];
}

export interface XhsCollectResult {
  runId: string;
  processed: number;
  total: number;
  failed: number;
  links?: string[];
  notes?: string[];
  error?: Error;
}
