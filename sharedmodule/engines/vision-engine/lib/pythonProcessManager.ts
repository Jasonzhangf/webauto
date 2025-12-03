// @ts-nocheck
import { spawn } from 'node:child_process';

export class PythonProcessManager {
  constructor({ host = '127.0.0.1', port = 8899, pythonBin = process.env.PYTHON_BIN || 'python3', entry = process.env.PY_SERVICE_ENTRY || 'runtime/vision/ui-recognition/python-service/ui_ins_server.py' } = {}) {
    this.host = host;
    this.port = port;
    this.pythonBin = pythonBin;
    this.entry = entry;
    this.proc = null;
  }

  async start() {
    if (this.proc) return;
    const args = [this.entry, '--host', this.host, '--port', String(this.port)];
    const cwd = process.cwd();
    this.proc = spawn(this.pythonBin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc.stdout.on('data', d => console.log(`[py] ${d.toString().trim()}`));
    this.proc.stderr.on('data', d => console.error(`[py] ${d.toString().trim()}`));
    this.proc.on('close', code => { console.log(`[py] exited with ${code}`); this.proc = null; });
  }

  async stop() {
    try { this.proc?.kill('SIGTERM'); } catch {}
    this.proc = null;
  }
}
