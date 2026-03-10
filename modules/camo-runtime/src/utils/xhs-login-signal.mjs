export function normalizeXhsLoginSignal(raw = {}) {
  const accountId = String(raw?.accountId || '').trim() || null;
  const hasAccountSignal = accountId !== null || raw?.hasAccountSignal === true;
  const hasLoginGuardRaw = raw?.hasLoginGuard === true;
  const loginUrl = raw?.loginUrl === true;
  return {
    ...raw,
    hasLoginGuardRaw,
    accountId,
    hasAccountSignal,
    hasLoginGuard: hasLoginGuardRaw,
  };
}
