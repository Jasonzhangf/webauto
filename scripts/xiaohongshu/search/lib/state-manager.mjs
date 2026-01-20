/**
 * 状态管理模块
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const STATE_FILE = '.collect-state.json';

class StateManager {
  constructor(keyword, env) {
    this.keyword = keyword;
    this.env = env;
    this.baseDir = path.join(os.homedir(), '.webauto', 'download', 'xiaohongshu', env, keyword);
    this.statePath = path.join(this.baseDir, STATE_FILE);
    this.state = {
      keyword,
      env,
      processedCount: 0,
      completedNotes: [],
      lastUpdatedAt: Date.now()
    };
  }

  async load() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      const content = await fs.readFile(this.statePath, 'utf8');
      const loaded = JSON.parse(content);
      // 合并状态
      this.state = { ...this.state, ...loaded };
      return this.state;
    } catch {
      // 首次运行，保存初始状态
      await this.save();
      return this.state;
    }
  }

  async save() {
    try {
      this.state.lastUpdatedAt = Date.now();
      await fs.writeFile(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }

  async markNoteCompleted(noteId) {
    if (!this.state.completedNotes.includes(noteId)) {
      this.state.completedNotes.push(noteId);
      this.state.processedCount = this.state.completedNotes.length;
      await this.save();
    }
  }

  isCompleted(noteId) {
    return this.state.completedNotes.includes(noteId);
  }
}

export default StateManager;
