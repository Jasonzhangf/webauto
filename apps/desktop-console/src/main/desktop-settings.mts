import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type ReplyStyle = 'friendly' | 'professional' | 'humorous' | 'concise' | 'custom';

export type AiReplyConfig = {
  enabled: boolean;
  provider: 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxChars: number;
  timeoutMs: number;
  stylePreset: ReplyStyle;
  styleCustom: string;
};

export type DesktopConsoleSettings = {
  unifiedApiUrl: string;
  browserServiceUrl: string;
  searchGateUrl: string;
  downloadRoot: string;
  defaultEnv: 'debug' | 'prod';
  defaultKeyword: string;
  defaultTarget: number;
  defaultDryRun: boolean;
  timeouts: { loginTimeoutSec: number; cmdTimeoutSec: number };
  profileAliases: Record<string, string>;
  profileColors: Record<string, string>;
  aiReply: AiReplyConfig;
};

type DefaultsFile = Partial<DesktopConsoleSettings> & {
  downloadRootParts?: string[];
};

type ConfigApi = {
  loadConfig: () => Promise<any>;
  saveConfig: (cfg: any) => Promise<void>;
  loader: { ensureExists: () => Promise<void>; merge: (base: any, override: any) => any };
};

function resolveHomeDir() {
  const homeDir =
    process.platform === 'win32'
      ? (process.env.USERPROFILE || os.homedir() || '')
      : (process.env.HOME || os.homedir() || '');
  if (!homeDir) throw new Error('无法获取用户主目录：HOME/USERPROFILE 未设置');
  return homeDir;
}

export function resolveLegacySettingsPath() {
  return path.join(resolveHomeDir(), '.webauto', 'ui-settings.console.json');
}

export function resolveDefaultDownloadRoot() {
  return path.join(resolveHomeDir(), '.webauto', 'download');
}

function normalizeAiReplyConfig(raw: any): AiReplyConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: false,
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:5520',
      apiKey: '',
      model: 'iflow.glm-5',
      temperature: 0.7,
      maxChars: 20,
      timeoutMs: 25000,
      stylePreset: 'friendly',
      styleCustom: '',
    };
  }
  const stylePresets: ReplyStyle[] = ['friendly', 'professional', 'humorous', 'concise', 'custom'];
  const preset = String(raw.stylePreset || 'friendly');
  return {
    enabled: Boolean(raw.enabled ?? false),
    provider: 'openai-compatible',
    baseUrl: String(raw.baseUrl || 'http://127.0.0.1:5520'),
    apiKey: String(raw.apiKey || ''),
    model: String(raw.model || 'iflow.glm-5'),
    temperature: Math.max(0, Math.min(2, Number(raw.temperature ?? 0.7))),
    maxChars: Math.max(5, Math.min(500, Math.floor(Number(raw.maxChars ?? 20)))),
    timeoutMs: Math.max(5000, Math.floor(Number(raw.timeoutMs ?? 25000))),
    stylePreset: stylePresets.includes(preset as ReplyStyle) ? (preset as ReplyStyle) : 'friendly',
    styleCustom: String(raw.styleCustom || ''),
  };
}

function normalizeSettings(defaults: Partial<DesktopConsoleSettings>, input: Partial<DesktopConsoleSettings>): DesktopConsoleSettings {
  const aliasesRaw = (input as any).profileAliases ?? (defaults as any).profileAliases ?? {};
  const aliases: Record<string, string> = {};
  if (aliasesRaw && typeof aliasesRaw === 'object') {
    for (const [k, v] of Object.entries(aliasesRaw as any)) {
      const key = String(k || '').trim();
      const val = String(v || '').trim();
      if (!key) continue;
      if (!val) continue;
      aliases[key] = val;
    }
  }
  const merged: DesktopConsoleSettings = {
    unifiedApiUrl: String(input.unifiedApiUrl || defaults.unifiedApiUrl || 'http://127.0.0.1:7701'),
    browserServiceUrl: String(input.browserServiceUrl || defaults.browserServiceUrl || 'http://127.0.0.1:7704'),
    searchGateUrl: String(input.searchGateUrl || defaults.searchGateUrl || 'http://127.0.0.1:7790'),
    downloadRoot: String(input.downloadRoot || defaults.downloadRoot || resolveDefaultDownloadRoot()),
    defaultEnv: (String(input.defaultEnv || defaults.defaultEnv || 'debug') === 'prod' ? 'prod' : 'debug'),
    defaultKeyword: String(input.defaultKeyword ?? defaults.defaultKeyword ?? ''),
    defaultTarget: Math.max(1, Math.floor(Number((input as any).defaultTarget ?? (defaults as any).defaultTarget ?? 20) || 20)),
    defaultDryRun: Boolean((input as any).defaultDryRun ?? (defaults as any).defaultDryRun ?? false),
    timeouts: {
      loginTimeoutSec: Math.max(
        30,
        Math.floor(
          Number(
            (input.timeouts as any)?.loginTimeoutSec ??
              (defaults.timeouts as any)?.loginTimeoutSec ??
              900,
          ),
        ),
      ),
      cmdTimeoutSec: Math.max(
        0,
        Math.floor(
          Number(
            (input.timeouts as any)?.cmdTimeoutSec ??
              (defaults.timeouts as any)?.cmdTimeoutSec ??
              0,
          ),
        ),
      ),
    },
    profileAliases: aliases,
    profileColors: normalizeColorMap((input as any).profileColors ?? (defaults as any).profileColors ?? {}),
    aiReply: normalizeAiReplyConfig((input as any).aiReply ?? (defaults as any).aiReply ?? {}),
  };
  return merged;
}

function normalizeColorMap(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as any)) {
    const key = String(k || '').trim();
    const val = String(v || '').trim();
    if (!key || !val) continue;
    // Accept only simple #RRGGBB to avoid injecting unexpected CSS.
    if (!/^#[0-9a-fA-F]{6}$/.test(val)) continue;
    out[key] = val;
  }
  return out;
}

async function readDefaultSettingsFromAppRoot(appRoot: string): Promise<DesktopConsoleSettings> {
  const defaultsPath = path.join(appRoot, 'default-settings.json');
  let raw: DefaultsFile = {};
  try {
    const text = await fs.readFile(defaultsPath, 'utf8');
    raw = (JSON.parse(text) || {}) as DefaultsFile;
  } catch {
    raw = {};
  }

  const base: Partial<DesktopConsoleSettings> = {
    unifiedApiUrl: raw.unifiedApiUrl,
    browserServiceUrl: raw.browserServiceUrl,
    searchGateUrl: raw.searchGateUrl,
    defaultEnv: raw.defaultEnv as any,
    defaultKeyword: raw.defaultKeyword,
    timeouts: raw.timeouts as any,
  };

  const downloadRoot =
    typeof (raw as any).downloadRoot === 'string'
      ? String((raw as any).downloadRoot)
      : Array.isArray(raw.downloadRootParts)
        ? path.join(resolveHomeDir(), ...raw.downloadRootParts.map((x) => String(x)))
        : resolveDefaultDownloadRoot();

  return normalizeSettings({ ...base, downloadRoot }, {});
}

async function readLegacySettings(): Promise<Partial<DesktopConsoleSettings> | null> {
  const legacyPath = resolveLegacySettingsPath();
  try {
    const text = await fs.readFile(legacyPath, 'utf8');
    const parsed = JSON.parse(text) || {};
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<DesktopConsoleSettings>;
  } catch {
    return null;
  }
}

async function tryLoadConfigApi(repoRoot: string): Promise<ConfigApi | null> {
  const distEntry = path.join(repoRoot, 'dist', 'modules', 'config', 'index.js');
  try {
    await fs.access(distEntry);
  } catch {
    return null;
  }
  try {
    const mod = (await import(pathToFileURL(distEntry).href)) as any;
    if (!mod?.loadConfig || !mod?.saveConfig || !mod?.loader?.ensureExists) return null;
    return mod as ConfigApi;
  } catch {
    return null;
  }
}

export async function readDesktopConsoleSettings(input: { appRoot: string; repoRoot: string }): Promise<DesktopConsoleSettings> {
  const defaults = await readDefaultSettingsFromAppRoot(input.appRoot);
  const configApi = await tryLoadConfigApi(input.repoRoot);

  if (!configApi) {
    const legacy = await readLegacySettings();
    return normalizeSettings(defaults, legacy || {});
  }

  await configApi.loader.ensureExists();
  const cfg = await configApi.loadConfig();
  const fromConfig = (cfg && cfg.desktopConsole) ? (cfg.desktopConsole as Partial<DesktopConsoleSettings>) : null;
  if (fromConfig) {
    return normalizeSettings(defaults, fromConfig);
  }

  const legacy = await readLegacySettings();
  if (legacy) {
    const migrated = normalizeSettings(defaults, legacy);
    const nextCfg = configApi.loader.merge(cfg, { desktopConsole: migrated });
    await configApi.saveConfig(nextCfg);
    return migrated;
  }

  const seeded = normalizeSettings(defaults, {});
  const nextCfg = configApi.loader.merge(cfg, { desktopConsole: seeded });
  await configApi.saveConfig(nextCfg);
  return seeded;
}

export async function writeDesktopConsoleSettings(
  input: { appRoot: string; repoRoot: string },
  next: Partial<DesktopConsoleSettings>,
): Promise<DesktopConsoleSettings> {
  const current = await readDesktopConsoleSettings(input);
  const defaults = await readDefaultSettingsFromAppRoot(input.appRoot);
  const merged = normalizeSettings(defaults, { ...current, ...next, timeouts: { ...current.timeouts, ...(next.timeouts || {}) } });

  const configApi = await tryLoadConfigApi(input.repoRoot);
  if (configApi) {
    await configApi.loader.ensureExists();
    const cfg = await configApi.loadConfig();
    const nextCfg = configApi.loader.merge(cfg, { desktopConsole: merged });
    await configApi.saveConfig(nextCfg);
    return merged;
  }

  // fallback: still write legacy file for compatibility when dist config is unavailable
  const legacyPath = resolveLegacySettingsPath();
  await fs.mkdir(path.dirname(legacyPath), { recursive: true });
  await fs.writeFile(legacyPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}
