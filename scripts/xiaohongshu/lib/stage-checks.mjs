/**
 * Stage checks + run-events logger
 */
import { emitRunEvent } from './logger.mjs';

export function recordStageCheck(stage, name, ok, detail = {}) {
  emitRunEvent('stage_check', {
    stage,
    name,
    ok: !!ok,
    ...detail,
  });
}

export function recordStageRecovery(stage, name, detail = {}) {
  emitRunEvent('stage_recovery', {
    stage,
    name,
    ...detail,
  });
}
