import type { ScheduleTask } from '../schedule-task-bridge.mts';

export type SchedulePayload = {
  id: string;
  name: string;
  enabled: boolean;
  commandType: string;
  scheduleType: ScheduleTask['scheduleType'];
  intervalMinutes: number;
  runAt: string | null;
  maxRuns: number | null;
  argv: Record<string, any>;
};

export type ConfigPanelState = {
  accountRows: import('../account-source.mts').UiAccountProfile[];
  taskRows: ScheduleTask[];
  selectedTaskId: string;
  saveTimeout: ReturnType<typeof setTimeout> | null;
  loadedFromLegacy: boolean;
  isDirty: boolean;
  suppressDirtyTracking: boolean;
  lastActionText: string;
};

export const DEFAULT_MAX_NOTES = 50;
