// apps/desktop-console/src/main/task-state-types.ts
// Shared types for task state (webauto-04b)

// Note: This file is intentionally minimal to avoid build issues

export interface TaskState {
  runId: string;
  profileId: string;
  keyword: string;
  phase: string;
  status: string;
  progress: { total: number; processed: number; failed: number };
  stats: {
    notesProcessed: number;
    commentsCollected: number;
    likesPerformed: number;
    repliesGenerated: number;
    imagesDownloaded: number;
    ocrProcessed: number;
  };
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  lastError?: any;
}

export interface StateUpdate {
  runId: string;
  type: string;
  data: any;
  timestamp: number;
}
