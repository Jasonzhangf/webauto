export function formatProfileTag(profileId: string): string {
  const id = String(profileId || '').trim();
  const m = id.match(/^profile-(\d+)$/i);
  if (!m) return id;
  const seq = Number(m[1]);
  if (!Number.isFinite(seq)) return id;
  return `P${String(seq).padStart(3, '0')}`;
}

export type EnvSnapshot = {
  camo: any;
  services: any;
  firefox: any;
  geoip: any;
  allReady?: boolean;
  browserReady?: boolean;
  missing?: {
    core: boolean;
    runtimeService: boolean;
    camo: boolean;
    runtime: boolean;
    geoip: boolean;
  };
};

export const getMissing = (snapshot: EnvSnapshot) =>
  snapshot?.missing || {
    core: true,
    runtimeService: true,
    camo: true,
    runtime: true,
    geoip: true,
  };

export const isEnvReady = (snapshot: EnvSnapshot) => Boolean(snapshot?.allReady);
