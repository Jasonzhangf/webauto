/**
 * Controller Action 工具函数
 */

export async function controllerAction(action: string, payload: any, apiUrl: string): Promise<any> {
  const res = await fetch(`${apiUrl}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout(20000),
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
