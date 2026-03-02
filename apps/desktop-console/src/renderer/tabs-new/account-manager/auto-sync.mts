import type { Account } from './list.mts';

export type AutoSyncController = {
  start: (profileId: string) => void;
  stopAll: () => void;
};

export function createAutoSyncController(
  deps: {
    ctx: any;
    checkAccountStatus: (profileId: string, opts?: { pendingWhileLogin?: boolean; resolveAlias?: boolean }) => Promise<boolean>;
  }
): AutoSyncController {
  const autoSyncTimers = new Map<string, ReturnType<typeof setInterval>>();
  const { ctx, checkAccountStatus } = deps;

  function startAutoSyncProfile(profileId: string) {
    const id = String(profileId || '').trim();
    if (!id) return;
    const existing = autoSyncTimers.get(id);
    if (existing) clearInterval(existing);
    const timeoutSec = Math.max(0, Number(ctx.api?.settings?.timeouts?.loginTimeoutSec || 0));
    const intervalMs = 2_000;
    const maxAttempts = timeoutSec > 0 ? Math.ceil((timeoutSec * 1000) / intervalMs) : Number.POSITIVE_INFINITY;
    let attempts = 0;
    void checkAccountStatus(id, { pendingWhileLogin: true }).then((ok) => {
      if (ok) {
        const timer = autoSyncTimers.get(id);
        if (timer) clearInterval(timer);
        autoSyncTimers.delete(id);
        void checkAccountStatus(id, { resolveAlias: true }).catch(() => null);
      }
    });
    const timer = setInterval(() => {
      attempts += 1;
      void checkAccountStatus(id, { pendingWhileLogin: true }).then((ok) => {
        if (ok || attempts >= maxAttempts) {
          const current = autoSyncTimers.get(id);
          if (current) clearInterval(current);
          autoSyncTimers.delete(id);
        }
      });
    }, intervalMs);
    autoSyncTimers.set(id, timer);
  }

  function stopAll() {
    for (const timer of autoSyncTimers.values()) clearInterval(timer);
    autoSyncTimers.clear();
  }

  return {
    start: startAutoSyncProfile,
    stopAll,
  };
}
