/**
 * Controller Action 工具函数
 */

export async function controllerAction(action: string, payload: any, apiUrl: string): Promise<any> {
  const timeoutMs =
    typeof payload?.timeoutMs === 'number' && Number.isFinite(payload.timeoutMs) && payload.timeoutMs > 0
      ? Math.floor(payload.timeoutMs)
      : 60000;
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Unified API expects payload nested under `payload`.
    body: JSON.stringify({ action, payload: payload || {} }),
    // 截图/容器操作在某些页面会更慢，允许调用方覆盖超时。
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function expandHome(p: string): string {
  if (!p) return p;
  if (p.startsWith('~/')) return `${process.env.HOME}/${p.slice(2)}`;
  return p;
}

export async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  const { writeFile: wf } = await import('node:fs/promises');
  await wf(filePath, content, 'utf8');
}

export async function downloadImage(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const { writeFile: wf } = await import('node:fs/promises');
  await wf(destPath, Buffer.from(buffer));
}
