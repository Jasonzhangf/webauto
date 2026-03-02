import type { NavigationWaitUntil, BrowserSessionOptions } from './types.js';
import type { Page } from 'playwright';

export function resolveInputActionTimeoutMs(): number {
  const raw = Number(process.env.CAMO_INPUT_ACTION_TIMEOUT_MS ?? process.env.CAMO_API_TIMEOUT_MS ?? 30000);
  return Math.max(1000, Number.isFinite(raw) ? raw : 30000);
}

export function resolveNavigationWaitUntil(): NavigationWaitUntil {
  const raw = String(process.env.CAMO_NAV_WAIT_UNTIL ?? 'commit').trim().toLowerCase();
  if (raw === 'load') return 'load';
  if (raw === 'domcontentloaded' || raw === 'dom') return 'domcontentloaded';
  if (raw === 'networkidle') return 'networkidle';
  return 'commit';
}

export function resolveInputActionMaxAttempts(): number {
  const raw = Number(process.env.CAMO_INPUT_ACTION_MAX_ATTEMPTS ?? 2);
  return Math.max(1, Math.min(3, Number.isFinite(raw) ? Math.floor(raw) : 2));
}

export function resolveInputRecoveryDelayMs(): number {
  const raw = Number(process.env.CAMO_INPUT_RECOVERY_DELAY_MS ?? 120);
  return Math.max(0, Number.isFinite(raw) ? Math.floor(raw) : 120);
}

export function resolveInputRecoveryBringToFrontTimeoutMs(): number {
  const raw = Number(process.env.CAMO_INPUT_RECOVERY_BRING_TO_FRONT_TIMEOUT_MS ?? 800);
  return Math.max(100, Number.isFinite(raw) ? Math.floor(raw) : 800);
}

export function resolveInputReadySettleMs(): number {
  const raw = Number(process.env.CAMO_INPUT_READY_SETTLE_MS ?? 80);
  return Math.max(0, Number.isFinite(raw) ? Math.floor(raw) : 80);
}

export function isTimeoutLikeError(error: unknown): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return message.includes('timed out') || message.includes('timeout');
}

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return raw;
  }
}

export async function ensureInputReadyOnPage(page: Page, headless: boolean, bringToFrontTimeoutMs: number, settleMs: number): Promise<void> {
  if (headless) return;
  let bringToFrontTimer: NodeJS.Timeout | null = null;
  try {
    await Promise.race<void>([
      page.bringToFront(),
      new Promise<void>((_resolve, reject) => {
        bringToFrontTimer = setTimeout(() => {
          reject(new Error(`input ready bringToFront timed out after ${bringToFrontTimeoutMs}ms`));
        }, bringToFrontTimeoutMs);
      }),
    ]);
  } catch {
    // Best-effort only
  } finally {
    if (bringToFrontTimer) clearTimeout(bringToFrontTimer);
  }
  if (settleMs > 0) {
    await page.waitForTimeout(settleMs).catch(() => {});
  }
}
