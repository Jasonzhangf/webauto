type PathApi = {
  pathJoin?: (...parts: any[]) => string;
  pathNormalize?: (p: string) => string;
  pathSep?: string;
};

function normalizePath(p: string, api?: PathApi) {
  if (!p) return '';
  if (api?.pathNormalize) return String(api.pathNormalize(p));
  return String(p);
}

function joinPath(api: PathApi | undefined, ...parts: string[]) {
  if (api?.pathJoin) return String(api.pathJoin(...parts));
  const sep = api?.pathSep || '/';
  return parts.filter(Boolean).join(sep);
}

export function resolveWebautoRoot(downloadRoot: string, api?: PathApi) {
  const raw = String(downloadRoot || '').trim();
  if (!raw) {
    return api?.pathSep === '\\' ? '%USERPROFILE%\\.webauto' : '~/.webauto';
  }
  const normalized = normalizePath(raw, api);
  const sep = api?.pathSep || '/';
  const suffix = `${sep}download`;
  if (normalized.toLowerCase().endsWith(suffix.toLowerCase())) {
    return normalized.slice(0, -suffix.length);
  }
  return normalized;
}

export function resolveConfigPath(downloadRoot: string, api?: PathApi) {
  const root = resolveWebautoRoot(downloadRoot, api);
  return joinPath(api, root, 'config.json');
}

export function resolveProfilesRoot(downloadRoot: string, api?: PathApi) {
  const root = resolveWebautoRoot(downloadRoot, api);
  return joinPath(api, root, 'profiles');
}

export function resolveFingerprintsRoot(downloadRoot: string, api?: PathApi) {
  const root = resolveWebautoRoot(downloadRoot, api);
  return joinPath(api, root, 'fingerprints');
}
