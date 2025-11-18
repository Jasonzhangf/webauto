#!/usr/bin/env node
// 重启 Python BrowserService（Camoufox 后端）——用于统一刷新浏览器后端代码
// - 按端口强杀旧的 Python 服务进程（默认 8888，可通过 BROWSER_SERVICE_PORT 覆盖）
// - 后台重新启动 `services/browser_launcher.py`

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../..');

const HOST = process.env.BROWSER_SERVICE_HOST || '127.0.0.1';
const PORT = Number(process.env.BROWSER_SERVICE_PORT || '8888');

function killPythonServiceIfAny() {
  if (process.platform === 'win32') {
    // Windows 环境暂不自动管理 Python 进程
    return;
  }
  try {
    const out = execSync(`lsof -ti :${PORT} || true`, { encoding: 'utf8' });
    const pids = out
      .split(/\s+/)
      .map((s) => Number(s.trim()))
      .filter(Boolean);
    if (!pids.length) {
      return;
    }
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 单个失败忽略
      }
    }
    console.log(`Python BrowserService: killed processes on :${PORT} -> [${pids.join(', ')}]`);
  } catch {
    // 端口检查失败不影响后续流程
  }
}

function startPythonService() {
  let pythonBin = process.env.PYTHON_BIN;
  if (!pythonBin) {
    pythonBin = 'python3';
  }
  const launcher = join(projectRoot, 'services', 'browser_launcher.py');

  const child = spawn(pythonBin, [launcher, '--host', HOST, '--port', String(PORT)], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });

  child.unref();
  console.log(
    `Python BrowserService restarted in background (pid=${child.pid}) on http://${HOST}:${PORT}`
  );
  return child.pid;
}

async function main() {
  console.log(
    `🔁 Restarting Python BrowserService on ${HOST}:${PORT} (Camoufox / browser_interface.py)...`
  );
  killPythonServiceIfAny();
  startPythonService();
}

main().catch((e) => {
  console.error('[restart-python-browser-service] failed:', e?.message || String(e));
  process.exit(1);
});

