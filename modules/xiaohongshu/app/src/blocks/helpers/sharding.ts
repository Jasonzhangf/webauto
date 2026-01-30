export interface ShardSpec {
  index: number;
  count: number;
  by?: 'noteId-hash';
}

export function fnv1a32(input: string) {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  const str = String(input || '');
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    // hash *= 16777619 (with 32-bit overflow)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

export function normalizeShard(spec?: Partial<ShardSpec> | null): ShardSpec | null {
  if (!spec) return null;
  const count = Math.max(1, Math.floor(Number(spec.count)));
  const index = Math.max(0, Math.floor(Number(spec.index)));
  if (!Number.isFinite(count) || !Number.isFinite(index)) return null;
  if (count <= 1) return null;
  if (index >= count) return null;
  return { index, count, by: spec.by || 'noteId-hash' };
}

export function shardFilterByNoteIdHash<T extends { noteId?: string }>(items: T[], shard: ShardSpec) {
  const list = Array.isArray(items) ? items : [];
  if (shard.count <= 1) return list;
  return list.filter((it) => {
    const id = String(it?.noteId || '').trim();
    if (!id) return false;
    return fnv1a32(id) % shard.count === shard.index;
  });
}

