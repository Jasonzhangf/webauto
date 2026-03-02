import path from 'node:path';
import { readFileSync } from 'node:fs';
import { APP_ROOT, REPO_ROOT } from './paths.mts';

type VersionInfo = {
  webauto: string;
  desktop: string;
  windowTitle: string;
  badge: string;
};

function readJsonVersion(filePath: string): string {
  try {
    const json = JSON.parse(readFileSync(filePath, 'utf8'));
    return String(json?.version || '').trim();
  } catch {
    return '';
  }
}

export function resolveVersionInfo(): VersionInfo {
  const webauto = readJsonVersion(path.join(REPO_ROOT, 'package.json')) || '0.0.0';
  const desktop = readJsonVersion(path.join(APP_ROOT, 'package.json')) || webauto;
  const windowTitle = `WebAuto Desktop v${webauto}`;
  const badge = desktop === webauto
    ? `v${webauto}`
    : `webauto v${webauto} · console v${desktop}`;
  return { webauto, desktop, windowTitle, badge };
}
