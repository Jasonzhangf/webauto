import type { ConfigPanelLayout } from './layout.mts';
import type { SchedulePayload } from './types.mts';
import { DEFAULT_MAX_NOTES } from './types.mts';
import { readNumber, toTaskNameFallback } from './helpers.mts';
import { toIsoOrNull, type ScheduleTask, asCsvText } from '../schedule-task-bridge.mts';

export function buildSchedulePayload(ui: ConfigPanelLayout, withId: string): SchedulePayload {
  const maxRunsRaw = ui.scheduleMaxRunsInput.value.trim();
  const maxRuns = maxRunsRaw ? Math.max(1, Number(maxRunsRaw) || 1) : null;
  const scheduleMode = String(ui.scheduleTypeSelect.value || 'immediate').trim();
  const periodicType = String(ui.schedulePeriodicTypeSelect.value || 'interval').trim();
  const runAtValue = String(ui.scheduleRunAtInput.value || '').trim();
  let scheduleType: ScheduleTask['scheduleType'] = 'once';
  let runAt = toIsoOrNull(runAtValue);
  let normalizedMaxRuns: number | null = maxRuns;
  if (scheduleMode === 'immediate') {
    scheduleType = 'once';
    runAt = new Date().toISOString();
    normalizedMaxRuns = 1;
  } else if (scheduleMode === 'periodic') {
    if (periodicType === 'daily' || periodicType === 'weekly') {
      scheduleType = periodicType;
    } else {
      scheduleType = 'interval';
      runAt = null;
    }
  } else {
    scheduleType = 'once';
    normalizedMaxRuns = 1;
  }
  const argv = {
    profile: ui.accountSelect.value.trim(),
    keyword: ui.keywordInput.value.trim(),
    'max-notes': readNumber(ui.targetInput, DEFAULT_MAX_NOTES, 1),
    env: ui.envSelect.value || 'debug',
    'service-reset': false,
    'fetch-body': ui.fetchBodyCb.checked,
    'do-comments': ui.fetchCommentsCb.checked,
    'persist-comments': ui.fetchCommentsCb.checked,
    'max-comments': readNumber(ui.maxCommentsInput, 0),
    'do-likes': ui.autoLikeCb.checked,
    'like-keywords': asCsvText(ui.likeKeywordsInput.value),
    'max-likes': readNumber(ui.maxLikesInput, 0),
    headless: ui.headlessCb.checked,
    'dry-run': ui.dryRunCb.checked,
  };
  return {
    id: String(withId || '').trim(),
    name: ui.taskNameInput.value.trim() || toTaskNameFallback(ui.keywordInput.value.trim()),
    enabled: ui.taskEnabledCb.checked,
    commandType: 'xhs-unified',
    scheduleType,
    intervalMinutes: readNumber(ui.scheduleIntervalInput, 30, 1),
    runAt,
    maxRuns: normalizedMaxRuns,
    argv,
  };
}
