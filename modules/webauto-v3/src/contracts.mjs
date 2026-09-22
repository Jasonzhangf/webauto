// Typed contracts shared by the v3 runtime.
// Every truth category lives here exactly once.

/** Guard verdicts are one of these five unions. */
export const GUARD_VERDICTS = Object.freeze([
  'allow',
  'deny',
  'unknown',
  'risk_control',
  'unavailable',
]);

export function isGuardVerdict(value) {
  return GUARD_VERDICTS.includes(String(value || ''));
}

export function makeGuardResult(partial = {}) {
  const verdict = String(partial.verdict || 'unknown');
  if (!isGuardVerdict(verdict)) {
    throw new Error(`invalid guard verdict: ${verdict}`);
  }
  return {
    verdict,
    guard_id: String(partial.guard_id || 'guard.unknown'),
    guard_version: String(partial.guard_version || 'v1'),
    subject_ref: String(partial.subject_ref || ''),
    evidence_ref: partial.evidence_ref ? String(partial.evidence_ref) : null,
    diagnostics: partial.diagnostics && typeof partial.diagnostics === 'object'
      ? { ...partial.diagnostics }
      : {},
    reason_code: partial.reason_code ? String(partial.reason_code) : undefined,
  };
}
