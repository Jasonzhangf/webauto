import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export function isImageFile(name: string): boolean {
  const lower = String(name || '').toLowerCase();
  return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp');
}

function findUp(startDir: string, fileName: string): string | null {
  let cur = startDir;
  for (let i = 0; i < 12; i += 1) {
    const candidate = path.join(cur, fileName);
    if (fs.existsSync(candidate)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function resolveDefaultBinaryCandidates(): string[] {
  const candidates: string[] = [];

  const homeBin = path.join(os.homedir(), '.webauto', 'bin', 'webauto-ocr-macos');
  candidates.push(homeBin);

  // Try relative to repo root (dev + built dist)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = findUp(here, 'package.json');
  if (repoRoot) {
    candidates.push(path.join(repoRoot, 'dist', 'plugins', 'ocr-macos', 'webauto-ocr-macos'));
    candidates.push(path.join(repoRoot, 'plugins', 'ocr-macos', '.build', 'release', 'webauto-ocr-macos'));
  }

  return candidates;
}

export function resolveMacOcrBinary(): { binPath: string; tried: string[] } {
  const tried: string[] = [];

  const envPath = process.env.WEBAUTO_OCR_BIN;
  if (envPath && envPath.trim()) {
    const p = envPath.trim();
    tried.push(p);
    if (fs.existsSync(p)) return { binPath: p, tried };
  }

  for (const candidate of resolveDefaultBinaryCandidates()) {
    tried.push(candidate);
    if (fs.existsSync(candidate)) return { binPath: candidate, tried };
  }

  return { binPath: '', tried };
}

function normalizeLanguages(raw?: string): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  const desired = v || 'chi_sim+eng';
  const parts = desired.includes('+')
    ? desired.split('+')
    : desired.includes(',')
      ? desired.split(',')
      : [desired];

  const mapped = parts
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      switch (s) {
        case 'chi_sim':
          return 'zh-Hans';
        case 'chi_tra':
          return 'zh-Hant';
        case 'eng':
          return 'en-US';
        case 'jpn':
          return 'ja-JP';
        default:
          return s;
      }
    });

  // stable & readable
  return Array.from(new Set(mapped)).join(',');
}

export function pickMacOcrLanguages(requested?: string): { languages: string } {
  return { languages: normalizeLanguages(requested) };
}

export interface MacOcrOneImageResult {
  image: string;
  text?: string;
  error?: string;
}

export async function ocrImagesWithMacPlugin(
  imagePaths: string[],
  config: { languages?: string; timeoutMs?: number } = {},
): Promise<{ languagesUsed: string; results: MacOcrOneImageResult[]; binPath: string }> {
  if (process.platform !== 'darwin') {
    throw new Error(`macOS OCR plugin only supported on darwin (platform=${process.platform})`);
  }

  const { binPath, tried } = resolveMacOcrBinary();
  if (!binPath) {
    const msg = [
      `macOS OCR binary not found.`,
      `Tried:`,
      ...tried.map((p) => `- ${p}`),
      `Build it via: node scripts/build/build-ocr-macos.mjs --install`,
      `Or set WEBAUTO_OCR_BIN=/absolute/path/to/webauto-ocr-macos`,
    ].join('\n');
    throw new Error(msg);
  }

  const languagesUsed = normalizeLanguages(config.languages);
  const timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : 120_000;

  if (!imagePaths.length) {
    return { languagesUsed, results: [], binPath };
  }

  // Batch size guard to avoid "argument list too long" in pathological cases.
  const batchSize = 32;
  const all: MacOcrOneImageResult[] = [];

  for (let i = 0; i < imagePaths.length; i += batchSize) {
    const batch = imagePaths.slice(i, i + batchSize);
    const { stdout } = await execFileAsync(
      binPath,
      ['--json', '--langs', languagesUsed, ...batch],
      { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
    );
    const parsed = JSON.parse(String(stdout || '[]')) as MacOcrOneImageResult[];
    all.push(...(Array.isArray(parsed) ? parsed : []));
  }

  return { languagesUsed, results: all, binPath };
}

