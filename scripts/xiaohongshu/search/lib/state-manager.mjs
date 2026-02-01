/**
 * Legacy StateManager（兼容层）
 *
 * 该实现仅保留旧 API，底层统一转发到 `modules/state` 的 `.collect-state.json`。
 * 运行前请确保已构建：`npm run build:services`
 */

import {
  loadXhsCollectState,
  updateXhsDetailCollection,
} from '../../../../dist/modules/state/src/xiaohongshu-collect-state.js';

class StateManager {
  constructor(keyword, env) {
    this.keyword = keyword;
    this.env = env;
    this.state = null;
  }

  async load() {
    this.state = await loadXhsCollectState({ keyword: this.keyword, env: this.env });
    return this.state;
  }

  async save() {
    // 兼容：不提供直写，统一由 modules/state 负责
    if (!this.state) await this.load();
    return this.state;
  }

  async markNoteCompleted(noteId) {
    const note = String(noteId || '').trim();
    if (!note) return;
    this.state = await updateXhsDetailCollection({
      keyword: this.keyword,
      env: this.env,
      noteId: note,
      status: 'completed',
    });
  }

  isCompleted(noteId) {
    const note = String(noteId || '').trim();
    if (!note) return false;
    const completed = new Set(this.state?.detailCollection?.completedNoteIds || []);
    return completed.has(note);
  }
}

export default StateManager;
