import { execSync } from 'node:child_process';

export function ensureUtf8Console() {
  if (process.platform !== 'win32') return;
  try {
    execSync('chcp 65001 >nul', { stdio: 'ignore', shell: true });
  } catch {
    // ignore
  }
  try {
    if (process.stdout?.setDefaultEncoding) process.stdout.setDefaultEncoding('utf8');
    if (process.stderr?.setDefaultEncoding) process.stderr.setDefaultEncoding('utf8');
  } catch {
    // ignore
  }
}
