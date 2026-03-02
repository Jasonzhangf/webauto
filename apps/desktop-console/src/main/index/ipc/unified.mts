export async function unifiedGet(readDesktopConsoleSettings: (input: { appRoot: string; repoRoot: string }) => Promise<any>, appRoot: string, repoRoot: string, pathname: string) {
  const base = String((await readDesktopConsoleSettings({ appRoot, repoRoot }))?.unifiedApiUrl || 'http://127.0.0.1:7701');
  const url = `${base}${pathname}`;
  const res = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  return json;
}

export async function unifiedAction(readDesktopConsoleSettings: (input: { appRoot: string; repoRoot: string }) => Promise<any>, appRoot: string, repoRoot: string, action: string, payload: any) {
  const base = String((await readDesktopConsoleSettings({ appRoot, repoRoot }))?.unifiedApiUrl || 'http://127.0.0.1:7701');
  const res = await fetch(`${base}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any)?.success === false || (json as any)?.ok === false) throw new Error((json as any)?.error || 'unified action failed');
  return json;
}
