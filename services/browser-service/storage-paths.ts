import os from 'os';
import path from 'path';

function resolveHomeDir() {
  const envHome = process.platform === 'win32'
    ? String(process.env.USERPROFILE || '').trim()
    : String(process.env.HOME || '').trim();
  return envHome || os.homedir();
}

function resolvePortableRoot() {
  return String(process.env.WEBAUTO_PORTABLE_ROOT || process.env.WEBAUTO_ROOT || '').trim();
}

function resolveDataRoot() {
  const portableRoot = resolvePortableRoot();
  if (portableRoot) return path.join(portableRoot, '.webauto');
  return path.join(resolveHomeDir(), '.webauto');
}

export function resolveProfilesRoot() {
  const envRoot = String(process.env.WEBAUTO_PATHS_PROFILES || '').trim();
  if (envRoot) return envRoot;
  return path.join(resolveDataRoot(), 'profiles');
}

export function resolveCookiesRoot() {
  const envRoot = String(process.env.WEBAUTO_PATHS_COOKIES || '').trim();
  if (envRoot) return envRoot;
  return path.join(resolveDataRoot(), 'cookies');
}

export function resolveLocksRoot() {
  const envRoot = String(process.env.WEBAUTO_PATHS_LOCKS || '').trim();
  if (envRoot) return envRoot;
  return path.join(resolveDataRoot(), 'locks');
}

