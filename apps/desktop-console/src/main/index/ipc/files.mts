import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

let cachedStateMod: any = null;
async function getStateModule(repoRoot: string) {
  if (cachedStateMod) return cachedStateMod;
  try {
    const p = path.join(repoRoot, 'dist', 'modules', 'state', 'src', 'xiaohongshu-collect-state.js');
    cachedStateMod = await import(pathToFileURL(p).href);
    return cachedStateMod;
  } catch {
    cachedStateMod = null;
    return null;
  }
}

export async function scanResults(repoRoot: string, resolveDefaultDownloadRoot: () => string, input: { downloadRoot?: string }) {
  const downloadRoot = String(input.downloadRoot || resolveDefaultDownloadRoot());
  const root = path.join(downloadRoot, 'xiaohongshu');

  const result: any = { ok: true, root, entries: [] as any[] };
  try {
    const stateMod = await getStateModule(repoRoot);
    const envDirs = await fs.readdir(root, { withFileTypes: true });
    for (const envEnt of envDirs) {
      if (!envEnt.isDirectory()) continue;
      const env = envEnt.name;
      const envPath = path.join(root, env);
      const keywordDirs = await fs.readdir(envPath, { withFileTypes: true });
      for (const kwEnt of keywordDirs) {
        if (!kwEnt.isDirectory()) continue;
        const keyword = kwEnt.name;
        const kwPath = path.join(envPath, keyword);
        const stat = await fs.stat(kwPath).catch(() => null);
        let stateSummary: any = null;
        if (stateMod?.loadXhsCollectState) {
          try {
            const state = await stateMod.loadXhsCollectState({ keyword, env, downloadRoot });
            stateSummary = {
              status: state?.status,
              links: state?.listCollection?.collectedUrls?.length || 0,
              target: state?.listCollection?.targetCount || 0,
              completed: state?.detailCollection?.completed || 0,
              failed: state?.detailCollection?.failed || 0,
              updatedAt: state?.lastUpdateTime || null,
            };
          } catch {
            // ignore
          }
        }
        result.entries.push({ env, keyword, path: kwPath, mtimeMs: stat?.mtimeMs || 0, state: stateSummary });
      }
    }
    result.entries.sort((a: any, b: any) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  } catch (e: any) {
    result.ok = false;
    result.error = e?.message || String(e);
  }
  return result;
}

export async function listXhsFullCollectScripts(root: string, re: RegExp) {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const scripts = entries
      .filter((ent) => ent.isFile() && re.test(ent.name))
      .map((ent) => {
        const name = ent.name;
        return {
          id: `xhs:${name}`,
          label: `Full Collect (${name})`,
          path: path.join(root, name),
        };
      });
    return { ok: true, scripts };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err), scripts: [] };
  }
}

export async function readTextPreview(input: { path: string; maxBytes?: number; maxLines?: number }) {
  const filePath = String(input.path || '');
  const maxBytes = typeof input.maxBytes === 'number' ? input.maxBytes : 80_000;
  const maxLines = typeof input.maxLines === 'number' ? input.maxLines : 200;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const clipped = raw.slice(0, maxBytes);
    const lines = clipped.split(/\r?\n/g).slice(0, maxLines);
    return { ok: true, path: filePath, text: lines.join('\n') };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ok: false, path: filePath, error: 'not_found' };
    return { ok: false, path: filePath, error: err?.message || String(err) };
  }
}

export async function readTextTail(input: { path: string; fromOffset?: number; maxBytes?: number }) {
  const filePath = String(input?.path || '');
  const requestedOffset = typeof input?.fromOffset === 'number' ? Math.max(0, Math.floor(input.fromOffset)) : 0;
  const maxBytes = typeof input?.maxBytes === 'number' ? Math.max(1024, Math.floor(input.maxBytes)) : 256_000;

  const st = await fs.stat(filePath);
  const size = Number(st?.size || 0);
  const fromOffset = requestedOffset > size ? 0 : requestedOffset;
  const toRead = Math.max(0, Math.min(maxBytes, size - fromOffset));
  if (toRead <= 0) {
    return { ok: true, path: filePath, text: '', fromOffset, nextOffset: fromOffset, fileSize: size };
  }

  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(toRead);
    const { bytesRead } = await fh.read(buf, 0, toRead, fromOffset);
    const text = buf.subarray(0, bytesRead).toString('utf8');
    return {
      ok: true,
      path: filePath,
      text,
      fromOffset,
      nextOffset: fromOffset + bytesRead,
      fileSize: size,
    };
  } finally {
    await fh.close();
  }
}

export async function readFileBase64(input: { path: string; maxBytes?: number }) {
  const filePath = String(input.path || '');
  const maxBytes = typeof input.maxBytes === 'number' ? input.maxBytes : 8_000_000;
  const buf = await fs.readFile(filePath);
  if (buf.byteLength > maxBytes) {
    return { ok: false, error: `file too large: ${buf.byteLength}` };
  }
  return { ok: true, data: buf.toString('base64') };
}

export async function listDir(input: { root: string; recursive?: boolean; maxEntries?: number }) {
  const root = String(input?.root || '');
  const recursive = Boolean(input?.recursive);
  const maxEntries = typeof input?.maxEntries === 'number' ? input?.maxEntries : 2000;
  const entries: Array<{
    path: string;
    rel: string;
    name: string;
    isDir: boolean;
    size: number;
    mtimeMs: number;
  }> = [];

  const stack: string[] = [root];
  while (stack.length > 0 && entries.length < maxEntries) {
    const dir = stack.pop()!;
    const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of items) {
      if (entries.length >= maxEntries) break;
      const full = path.join(dir, ent.name);
      const st = await fs.stat(full).catch(() => null);
      entries.push({
        path: full,
        rel: path.relative(root, full),
        name: ent.name,
        isDir: ent.isDirectory(),
        size: st?.size || 0,
        mtimeMs: st?.mtimeMs || 0,
      });
      if (recursive && ent.isDirectory()) stack.push(full);
    }
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return b.mtimeMs - a.mtimeMs;
  });

  return { ok: true, root, entries, truncated: entries.length >= maxEntries };
}
