/**
 * RecordFixtureBlock
 *
 * 通用 fixture 录制 Block，将结构化数据写入用户目录：
 *   ~/.webauto/fixtures/{platform}/{category}-{id}.json
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface RecordFixtureInput {
  platform: string;
  category: string;
  id: string;
  data: any;
}

export interface RecordFixtureOutput {
  success: boolean;
  error?: string;
  path?: string;
}

export async function execute(input: RecordFixtureInput): Promise<RecordFixtureOutput> {
  const { platform, category, id, data } = input;

  if (!platform || !category || !id) {
    return {
      success: false,
      error: 'platform, category and id are required',
    };
  }

  try {
    const homeDir = os.homedir();
    const baseDir = path.join(homeDir, '.webauto', 'fixtures', platform);
    await fs.mkdir(baseDir, { recursive: true });

    const filename = `${category}-${id}.json`;
    const filePath = path.join(baseDir, filename);

    const payload = {
      platform,
      category,
      id,
      capturedAt: new Date().toISOString(),
      data,
    };

    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');

    return {
      success: true,
      path: filePath,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

