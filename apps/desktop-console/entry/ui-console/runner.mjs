import path from 'node:path';
import { spawn } from 'node:child_process';

export class UITestRunner {
  constructor(options = {}) {
    this.profile = options.profile || 'test-profile';
    this.keyword = options.keyword || '自动化测试';
    this.target = options.target || 5;
    this.headless = options.headless || false;
    this.output = options.output || null;
    this.results = [];
    this.startTime = Date.now();
  }

  log(message, type = 'info') {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${type}] ${message}`;
    console.log(line);
    this.results.push({ ts, type, message });
  }

  ensure(condition, message) {
    if (!condition) throw new Error(message);
  }

  parseJsonOutput(output) {
    const text = String(output || '').trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          return JSON.parse(lines[i]);
        } catch {
          // keep scanning
        }
      }
    }
    return null;
  }

  async runCommand(cmd, args, timeoutMs = 30000, options = {}) {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...(options.env || {}) };
      const child = spawn(cmd, args, { shell: false, stdio: 'pipe', cwd: options.cwd || process.cwd(), env });
      let stdout = '';
      let stderr = '';
      let timer = null;
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`Command timeout: ${cmd}`));
        }, timeoutMs);
      }
      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (code === 0) resolve({ ok: true, stdout, stderr });
        else reject(new Error(stderr || `Exit code: ${code}`));
      });
    });
  }

  async runNodeScript(scriptPath, scriptArgs = [], timeoutMs = 30000, options = {}) {
    const cmd = process.execPath;
    return this.runCommand(cmd, [scriptPath, ...scriptArgs], timeoutMs, options);
  }

  async runJsonNodeScript(scriptPath, scriptArgs = [], timeoutMs = 30000, options = {}) {
    const out = await this.runNodeScript(scriptPath, scriptArgs, timeoutMs, options);
    const json = this.parseJsonOutput(out.stdout);
    this.ensure(json && typeof json === 'object', `JSON parse failed for ${path.basename(scriptPath)}`);
    return json;
  }

  async waitForHttp(url, timeoutMs = 20000) {
    const started = Date.now();
    while ((Date.now() - started) < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return true;
      } catch {
        // keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return false;
  }

  async ensureUnifiedServer() {
    const healthUrl = 'http://127.0.0.1:7701/health';
    const running = await this.waitForHttp(healthUrl, 1200);
    if (running) return { child: null, owned: false };

    const child = spawn(process.execPath, [path.join(process.cwd(), 'dist/apps/webauto/server.js')], {
      cwd: process.cwd(),
      env: { ...process.env, WEBAUTO_RUNTIME_MODE: 'unified' },
      stdio: 'ignore',
    });
    const ready = await this.waitForHttp(healthUrl, 20000);
    if (!ready) {
      try { child.kill('SIGTERM'); } catch {}
      throw new Error('unified api did not become ready on :7701');
    }
    return { child, owned: true };
  }
}
