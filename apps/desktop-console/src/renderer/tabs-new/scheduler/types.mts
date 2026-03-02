import type { UiAccountProfile } from '../../account-source.mts';
import type { ScheduleTask } from '../schedule-task-bridge.mts';

export type SchedulerState = {
  tasks: ScheduleTask[];
  accountRows: UiAccountProfile[];
  daemonRunId: string;
  unsubscribeCmd: (() => void) | null;
  pendingFocusTaskId: string;
};
