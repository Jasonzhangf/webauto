import { appendFile, readFile } from 'node:fs/promises';

async function readRows(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function createRealtimeJsonlWriter(filePath, { dedupeKey = 'noteId', seedRows = null } = {}) {
  const baseRows = Array.isArray(seedRows) ? seedRows : await readRows(filePath);
  const seen = new Set(
    baseRows
      .map((row) => String(row?.[dedupeKey] || '').trim())
      .filter(Boolean),
  );

  let addedCount = 0;
  const existingCount = seen.size;

  return {
    existingCount,
    async append(row) {
      const key = String(row?.[dedupeKey] || '').trim();
      if (!key || seen.has(key)) {
        return { appended: false, reason: key ? 'duplicate' : 'missing_key' };
      }
      seen.add(key);
      await appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
      addedCount += 1;
      return { appended: true };
    },
    stats() {
      return { existing: existingCount, added: addedCount, total: seen.size };
    },
  };
}
