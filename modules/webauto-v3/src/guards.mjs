// Structural risk guard. It returns the shared GuardResult union.

import { makeGuardResult } from './contracts.mjs';

export function riskGuard({ url = '', title = '', bodyText = '' } = {}) {
  const haystack = `${url}\n${title}\n${bodyText}`;
  if (/captcha|verify|验证码|安全验证|访问过于频繁/i.test(haystack)) {
    return makeGuardResult({
      verdict: 'risk_control',
      guard_id: 'structure.risk',
      guard_version: 'v1',
      subject_ref: url,
      diagnostics: { matched: 'captcha_or_rate_limit' },
      reason_code: 'risk_control_detected',
    });
  }
  if (/login|signin|newlogin|登录/i.test(haystack)) {
    return makeGuardResult({
      verdict: 'risk_control',
      guard_id: 'structure.risk',
      guard_version: 'v1',
      subject_ref: url,
      diagnostics: { matched: 'login_required' },
      reason_code: 'login_required',
    });
  }
  return makeGuardResult({
    verdict: 'allow',
    guard_id: 'structure.risk',
    guard_version: 'v1',
    subject_ref: url,
    diagnostics: {},
  });
}
