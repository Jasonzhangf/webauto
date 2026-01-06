/**
 * Workflow Block: SaveFile
 *
 * 保存文件到磁盘
 */

import fs from 'fs';
import path from 'path';

export interface SaveFileInput {
  content: string;
  path: string;
  encoding?: BufferEncoding;
}

export interface SaveFileOutput {
  saved: boolean;
  path: string;
  size: number;
  error?: string;
}

/**
 * 保存文件
 *
 * @param input - 输入参数
 * @returns Promise<SaveFileOutput>
 */
export async function execute(input: SaveFileInput): Promise<SaveFileOutput> {
  const { content, path: filePath, encoding = 'utf-8' } = input;

  if (!content) {
    return {
      saved: false,
      path: filePath,
      size: 0,
      error: 'Empty content'
    };
  }

  if (!filePath) {
    return {
      saved: false,
      path: '',
      size: 0,
      error: 'Missing file path'
    };
  }

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, encoding);

    const stats = fs.statSync(filePath);

    return {
      saved: true,
      path: filePath,
      size: stats.size
    };
  } catch (error: any) {
    return {
      saved: false,
      path: filePath,
      size: 0,
      error: `Save error: ${error.message}`
    };
  }
}
