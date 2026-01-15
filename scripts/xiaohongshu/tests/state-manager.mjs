import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const STATE_FILE_NAME = '.collect-state.json';
const DEFAULT_VERSION = 1;

function structuredCloneOrJson(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function generateResumeToken() {
  return crypto.randomBytes(8).toString('hex');
}

async function atomicWrite(filePath, data) {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.promises.writeFile(tmpPath, data, 'utf8');
  await fs.promises.rename(tmpPath, filePath);
}

async function readJson(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export class CollectStateManager {
  constructor(statePath, defaults = {}) {
    this.statePath = statePath;
    this.defaults = defaults;
    this.state = null;
  }

  _createDefaultState() {
    const now = Date.now();
    return {
      version: DEFAULT_VERSION,
      resumeToken: generateResumeToken(),
      global: {
        keyword: this.defaults.keyword || '',
        env: this.defaults.env || '',
        target: Number(this.defaults.target) || 0,
      },
      history: {
        completed: [],
        safeDetailIndexSize: 0,
      },
      currentStep: null,
      lastUpdatedAt: now,
    };
  }

  async load() {
    const diskState = await readJson(this.statePath);
    const base = this._createDefaultState();
    const merged = {
      ...base,
      ...diskState,
      global: {
        ...base.global,
        ...(diskState?.global || {}),
      },
      history: {
        ...base.history,
        ...(diskState?.history || {}),
      },
    };

    // global 信息以“本次运行参数”为准，避免 target/keyword/env 变更后仍沿用旧值导致逻辑偏离预期。
    // 续传所需信息保留在 history/currentStep 中。
    merged.global = {
      ...merged.global,
      keyword: base.global.keyword,
      env: base.global.env,
      target: base.global.target,
    };

    merged.version = DEFAULT_VERSION;
    merged.resumeToken = merged.resumeToken || generateResumeToken();
    merged.lastUpdatedAt = Date.now();
    this.state = merged;
    await atomicWrite(this.statePath, JSON.stringify(merged, null, 2));
    return merged;
  }

  getState() {
    return this.state;
  }

  async save(updater) {
    if (!this.state) {
      await this.load();
    }
    const draft = structuredCloneOrJson(this.state);
    const nextState =
      typeof updater === 'function' ? updater(draft) || draft : updater;
    nextState.version = DEFAULT_VERSION;
    nextState.resumeToken =
      nextState.resumeToken || this.state.resumeToken || generateResumeToken();
    nextState.lastUpdatedAt = Date.now();
    await atomicWrite(this.statePath, JSON.stringify(nextState, null, 2));
    this.state = nextState;
    return nextState;
  }

  async clear() {
    this.state = null;
    await fs.promises.rm(this.statePath, { force: true });
  }

  getStatePath() {
    return this.statePath;
  }
}

export { STATE_FILE_NAME, generateResumeToken };
