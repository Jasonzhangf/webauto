/**
 * ProgressTracker - 任务进度持久化与恢复
 * 
 * 功能：
 * 1. 保存采集进度（已采集 noteId、关键词索引、搜索轮次）
 * 2. 支持断点续采（进程崩溃后可恢复）
 * 3. 提供去重依据（seenNoteIds 集合）
 * 4. 成功完成后自动清理进度文件
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ProgressState {
  version: number;
  sessionId: string;
  updatedAt: string;
  keywordIndex: number;
  searchRound: number;
  collectedCount: number;
  seenNoteIds: string[];
  lastKeyword?: string;
  lastNoteId?: string;
}

export class ProgressTracker {
  private dataDir: string;
  private sessionId: string;
  private progressPath: string;

  constructor(dataDir: string, sessionId: string) {
    this.dataDir = dataDir;
    this.sessionId = sessionId;
    this.progressPath = path.join(dataDir, `.progress_${sessionId}.json`);
  }

  /**
   * 保存当前进度
   */
  async save(state: Omit<ProgressState, 'version' | 'updatedAt'>): Promise<void> {
    const fullState: ProgressState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ...state
    };
    await fs.writeFile(this.progressPath, JSON.stringify(fullState, null, 2), 'utf-8');
    console.log(`[ProgressTracker] 进度已保存: ${state.collectedCount} 条, keywordIndex=${state.keywordIndex}, searchRound=${state.searchRound}`);
  }

  /**
   * 加载保存的进度
   */
  async load(): Promise<ProgressState | null> {
    try {
      const data = await fs.readFile(this.progressPath, 'utf-8');
      const state = JSON.parse(data) as ProgressState;
      
      // 版本兼容性检查
      if (state.version !== 1) {
        console.warn(`[ProgressTracker] 不支持的进度版本: ${state.version}`);
        return null;
      }
      
      console.log(`[ProgressTracker] 发现保存的进度: ${state.collectedCount} 条, 最后更新: ${state.updatedAt}`);
      return state;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // 文件不存在，正常情况
        return null;
      }
      console.warn(`[ProgressTracker] 加载进度失败: ${err.message}`);
      return null;
    }
  }

  /**
   * 清理进度文件（任务成功完成后调用）
   */
  async cleanup(): Promise<void> {
    try {
      await fs.unlink(this.progressPath);
      console.log('[ProgressTracker] 进度文件已清理');
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[ProgressTracker] 清理进度文件失败: ${err.message}`);
      }
    }
  }

  /**
   * 检查是否存在保存的进度
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.progressPath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * 便捷函数：创建进度跟踪器
 */
export function createProgressTracker(dataDir: string, sessionId: string): ProgressTracker {
  return new ProgressTracker(dataDir, sessionId);
}
