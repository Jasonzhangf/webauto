// The only browser boundary in the v3 runtime.
// Talks to the installed `camo` CLI for start/viewport/goto/evaluate/scroll.
// Tests inject a fake runner.

import { spawn } from 'node:child_process';

function findCamoBinary() {
  return process.env.WEBAUTO_V3_CAMO_BIN || process.env.CAMO_BIN || 'camo';
}

function parseLastJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines.slice(i).join('\n'));
      } catch {
        try {
          return JSON.parse(lines[i]);
        } catch {
          continue;
        }
      }
    }
    return null;
  }
}

function execCamo(args, { timeoutMs = 30_000, cwd } = {}) {
  const bin = findCamoBinary();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\ntimeout after ${timeoutMs}ms`,
        json: null,
        timedOut: true,
      });
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    child.on('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        stdout,
        stderr,
        json: parseLastJson(stdout),
        timedOut: false,
      });
    });
  });
}

export class CamoAdapter {
  constructor({ runner = execCamo, cwd = process.cwd(), defaultTimeoutMs = 30_000 } = {}) {
    this._runner = runner;
    this._cwd = cwd;
    this._defaultTimeoutMs = defaultTimeoutMs;
    this._targetCache = new Map();
  }

  setTarget(profileId, target) {
    if (!profileId) return;
    if (target === null) {
      this._targetCache.delete(profileId);
    } else {
      this._targetCache.set(profileId, String(target));
    }
  }

  targetFor(profileId) {
    return this._targetCache.get(profileId) || null;
  }

  _withTarget(args, profileId) {
    const target = this.targetFor(profileId);
    // The profile must accompany the target: a target id is only resolvable
    // inside the profile that owns it, so omitting --profile makes camo fall
    // back to the default profile and reject the target as cross-profile.
    const scoped = profileId ? [...args, '--profile', profileId] : args;
    return target ? [...scoped, '--target', target] : scoped;
  }

  async start({ profileId, url, headless = false, width, height, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.start requires profileId');
    const args = ['start', '--profile', profileId];
    if (url) args.push('--url', url);
    if (headless) args.push('--headless');
    if (Number.isFinite(width) && Number.isFinite(height)) {
      args.push('--width', String(width), '--height', String(height));
    }
    const result = await this._runner(args, { timeoutMs: timeoutMs || 60_000, cwd: this._cwd });
    if (!result.ok) {
      throw new Error(`camo start failed: ${result.stderr || result.stdout}`);
    }
    const data = result.json || {};
    const target = data.target || data.sessionId || data.session_id || null;
    if (target) this.setTarget(profileId, target);
    return {
      ok: true,
      profileId,
      target,
      sessionId: data.sessionId || data.session_id || null,
      viewport: data.viewport || null,
    };
  }

  async setViewport({ profileId, width, height, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.setViewport requires profileId');
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      throw new Error('CamoAdapter.setViewport requires width and height');
    }
    const args = this._withTarget(
      ['set-viewport', '--width', String(w), '--height', String(h)],
      profileId,
    );
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo viewport failed: ${result.stderr || result.stdout}`);
    }
    return { ok: true, width: w, height: h };
  }

  async goto({ profileId, url, waitUntil, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.goto requires profileId');
    if (!url) throw new Error('CamoAdapter.goto requires url');
    const args = this._withTarget(['goto', url], profileId);
    if (waitUntil) args.push('--waitUntil', waitUntil);
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo goto failed: ${result.stderr || result.stdout}`);
    }
    return { ok: true, url };
  }

  async pageInfo({ profileId, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.pageInfo requires profileId');
    const args = this._withTarget(['get-page-info'], profileId);
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo get-page-info failed: ${result.stderr || result.stdout}`);
    }
    const data = result.json || {};
    return {
      url: data.url || data.currentUrl || data.href || '',
      title: data.title || data.pageTitle || '',
      viewport: data.viewport || data.windowSize || { width: 0, height: 0 },
      scroll: data.scroll || { x: 0, y: 0 },
      textDigest: data.textDigest || data.text_digest || '',
    };
  }

  async evaluate({ profileId, script, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.evaluate requires profileId');
    if (!script) throw new Error('CamoAdapter.evaluate requires script');
    const args = this._withTarget(['evaluate', '--script', script], profileId);
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo evaluate failed: ${result.stderr || result.stdout}`);
    }
    const data = result.json || {};
    return data && typeof data === 'object' && 'result' in data ? data.result : data;
  }

  async type({ profileId, text, selector = null, delay = 0, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.type requires profileId');
    const value = String(text || '');
    if (!value) throw new Error('CamoAdapter.type requires text');
    const args = this._withTarget(['type', value], profileId);
    if (selector) args.push('--selector', selector);
    if (Number(delay) > 0) args.push('--delay', String(Number(delay)));
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo type failed: ${result.stderr || result.stdout}`);
    }
    return result.json || { ok: true, typedChars: value.length };
  }

  // Text entry goes through the native value setter plus input/change events.
  // camo's `type` drives real key events, which a CJK IME on macOS can swallow
  // or transform, so it is not the text path: it stays reserved for shortcuts.
  async fillInput({ profileId, selector, value, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.fillInput requires profileId');
    if (!selector) throw new Error('CamoAdapter.fillInput requires selector');
    const script = `
      (() => {
        const el = document.querySelector(${JSON.stringify(String(selector))});
        if (!el) return { ok: false, errorCode: 'E_INPUT_NOT_FOUND' };
        const proto = el instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (!descriptor || !descriptor.set) return { ok: false, errorCode: 'E_INPUT_NOT_SETTABLE' };
        el.focus();
        descriptor.set.call(el, ${JSON.stringify(String(value ?? ''))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, value: el.value, length: el.value.length };
      })()
    `;
    const data = await this.evaluate({ profileId, script, timeoutMs });
    if (!data?.ok) {
      throw new Error(`camo fillInput failed: ${data?.errorCode || 'unknown'}`);
    }
    return data;
  }

  async click({ profileId, selector, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.click requires profileId');
    if (!selector) throw new Error('CamoAdapter.click requires selector');
    const args = this._withTarget(['click', '--selector', selector], profileId);
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo click failed: ${result.stderr || result.stdout}`);
    }
    return result.json || { ok: true };
  }

  // Shortcut keys only (Enter/Escape/Tab/arrows). Text never goes through
  // key events: a CJK IME can swallow or transform them, which is why
  // fillInput exists.
  async pressKey({ profileId, key, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.pressKey requires profileId');
    if (!key) throw new Error('CamoAdapter.pressKey requires key');
    const args = this._withTarget(['keyboard', 'press', String(key)], profileId);
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo keyboard press failed: ${result.stderr || result.stdout}`);
    }
    return result.json || { ok: true, key };
  }

  async scroll({ profileId, dx = 0, dy = 0, atX, atY, timeoutMs } = {}) {
    if (!profileId) throw new Error('CamoAdapter.scroll requires profileId');
    const args = this._withTarget(['scroll', '--x', String(dx), '--y', String(dy)], profileId);
    if (Number.isFinite(Number(atX))) args.push('--at-x', String(Number(atX)));
    if (Number.isFinite(Number(atY))) args.push('--at-y', String(Number(atY)));
    const result = await this._runner(args, {
      timeoutMs: timeoutMs || this._defaultTimeoutMs,
      cwd: this._cwd,
    });
    if (!result.ok) {
      throw new Error(`camo scroll failed: ${result.stderr || result.stdout}`);
    }
    return { ok: true, dx, dy };
  }

}
