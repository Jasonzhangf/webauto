import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface AtomicWriteOptions {
  encoding?: BufferEncoding;
}

export async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

export async function atomicWriteJson(
  filePath: string,
  data: unknown,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const encoding = options.encoding || 'utf8';
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), encoding);
  try {
    await fs.rename(tmpPath, filePath);
  } catch (err: any) {
    // Windows: rename 不允许覆盖已存在文件
    if (err?.code === 'EEXIST' || err?.code === 'EPERM') {
      await fs.rm(filePath, { force: true });
      await fs.rename(tmpPath, filePath);
      return;
    }
    throw err;
  }
}

