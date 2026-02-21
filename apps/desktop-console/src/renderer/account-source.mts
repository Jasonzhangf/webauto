export type UiAccountProfile = {
  profileId: string;
  accountRecordId: string | null;
  platform: string;
  accountId: string | null;
  alias: string | null;
  name: string | null;
  status: string;
  valid: boolean;
  reason: string | null;
  updatedAt: string | null;
};

function asText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeRow(row: any): UiAccountProfile | null {
  const profileId = asText(row?.profileId);
  if (!profileId) return null;
  return {
    profileId,
    accountRecordId: asText(row?.accountRecordId),
    platform: asText(row?.platform) || 'xiaohongshu',
    accountId: asText(row?.accountId),
    alias: asText(row?.alias),
    name: asText(row?.name),
    status: asText(row?.status) || 'invalid',
    valid: row?.valid === true && Boolean(asText(row?.accountId)),
    reason: asText(row?.reason),
    updatedAt: asText(row?.updatedAt),
  };
}

export async function listAccountProfiles(api: any): Promise<UiAccountProfile[]> {
  const script = api.pathJoin('apps', 'webauto', 'entry', 'account.mjs');
  const out = await api.cmdRunJson({
    title: 'account list',
    cwd: '',
    args: [script, 'list', '--json'],
    timeoutMs: 20_000,
  });
  const rows = Array.isArray(out?.json?.profiles) ? out.json.profiles : [];
  return rows.map(normalizeRow).filter(Boolean) as UiAccountProfile[];
}
