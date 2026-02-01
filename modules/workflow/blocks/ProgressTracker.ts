/**
 * ProgressTracker - 任务进度持久化与恢复
 * 
 * 功能：
 * 1. 保存采集进度（已采集 noteId、关键词索引、搜索轮次）
 *    - P2.1: 增加容器维度去重（noteId + containerId），避免多容器路径指向同一 note 时重复采集
 *    - 向后兼容：旧版本进度文件只有 seenNoteIds，新版本增加 seenKeys
 * 2. 支持断点续采（进程崩溃后可恢复）
 * 3. 提供去重依据（seenNoteIds 集合）
 * 4. 成功完成后自动清理进度文件
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, readJsonMaybe } from '../../state/src/atomic-json.js';

export interface ProgressState {
  version: number;
  sessionId: string;
  updatedAt: string;
  keywordIndex: number;
  searchRound: number;
  collectedCount: number;
  seenNoteIds: string[];  // 向后兼容保留
  seenKeys?: string[];    // 新增：noteId||containerId 去重键
  lastKeyword?: string;
  lastNoteId?: string;
  lastContainerId?: string;  // 新增：最后处理的容器 ID
}

export interface DedupeEntry {
  noteId: string;
  containerId: string;
  key: string;  // noteId||containerId
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
  async save(
    state: Omit<ProgressState, 'version' | 'updatedAt'> & {
      seenKeys?: string[];
    }
  ): Promise<void> {
    const fullState: ProgressState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ...state
    };
    await atomicWriteJson(this.progressPath, fullState);
    console.log(
      `[ProgressTracker] 进度已保存: ${state.collectedCount} 条, ` +
      `keys=${state.seenKeys?.length || state.seenNoteIds?.length || 0}, ` +
      `keywordIndex=${state.keywordIndex}, searchRound=${state.searchRound}`
    );
  }

  /**
   * 加载保存的进度
   * 
   * 向后兼容策略：
   * - 旧版本进度文件只有 seenNoteIds，新版本会自动填充 seenKeys（假设 containerId 为空）
   * - 新版本进度文件同时保存 seenNoteIds 和 seenKeys
   */
  async load(): Promise<ProgressState | null> {
    try {
      const state = await readJsonMaybe<ProgressState>(this.progressPath);
      if (!state) return null;
      
      // 版本兼容性检查
      if (state.version !== 1) {
        console.warn(`[ProgressTracker] 不支持的进度版本: ${state.version}`);
        return null;
      }
      
      // 向后兼容：如果没有 seenKeys，从 seenNoteIds 生成
      if (!state.seenKeys && state.seenNoteIds) {
        state.seenKeys = state.seenNoteIds.map(noteId => `${noteId}||`);
        console.log(
          `[ProgressTracker] 兼容旧版本进度文件，从 seenNoteIds 生成 ${state.seenKeys.length} 个 seenKeys`
        );
      }
      
      console.log(`[ProgressTracker] 发现保存的进度: ${state.collectedCount} 条, 最后更新: ${state.updatedAt}`);
      return state;
    } catch (err: any) {
      console.warn(`[ProgressTracker] 加载进度失败: ${err.message}`);
      return null;
    }
  }

  /**
   * 生成去重键
   * 
   * @param noteId - 笔记 ID
   * @param containerId - 容器 ID（可选）
   * @returns 去重键：noteId||containerId
   */
  static makeDedupeKey(noteId: string, containerId?: string): string {
    return `${noteId}||${containerId || ''}`;
  }

  /**
   * 解析去重键
   * 
   * @param key - 去重键
   * @returns DedupeEntry
   */
  static parseDedupeKey(key: string): DedupeEntry {
    const [noteId, containerId] = key.split('||');
    return {
      noteId: noteId || '',
      containerId: containerId || '',
      key
    };
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
