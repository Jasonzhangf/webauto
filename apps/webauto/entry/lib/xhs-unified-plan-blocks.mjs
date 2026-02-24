export function buildEvenShardPlan({ profiles, totalNotes, defaultMaxNotes }) {
  const uniqueProfiles = Array.from(new Set(profiles.map((item) => String(item || '').trim()).filter(Boolean)));
  if (uniqueProfiles.length === 0) return [];

  if (!Number.isFinite(totalNotes) || totalNotes <= 0) {
    return uniqueProfiles.map((profileId) => ({ profileId, assignedNotes: defaultMaxNotes }));
  }

  const base = Math.floor(totalNotes / uniqueProfiles.length);
  const remainder = totalNotes % uniqueProfiles.length;
  const plan = uniqueProfiles.map((profileId, index) => ({
    profileId,
    assignedNotes: base + (index < remainder ? 1 : 0),
  }));
  return plan.filter((item) => item.assignedNotes > 0);
}

export function buildDynamicWavePlan({ profiles, remainingNotes }) {
  const uniqueProfiles = Array.from(new Set(profiles.map((item) => String(item || '').trim()).filter(Boolean)));
  if (uniqueProfiles.length === 0) return [];
  const remaining = Math.max(0, Number(remainingNotes) || 0);
  if (remaining <= 0) return [];

  if (remaining < uniqueProfiles.length) {
    return uniqueProfiles.slice(0, remaining).map((profileId) => ({
      profileId,
      assignedNotes: 1,
    }));
  }

  const waveTotal = remaining - (remaining % uniqueProfiles.length);
  return buildEvenShardPlan({
    profiles: uniqueProfiles,
    totalNotes: waveTotal > 0 ? waveTotal : remaining,
    defaultMaxNotes: 1,
  });
}

export async function runWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(1, Math.min(items.length || 1, concurrency || 1));
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => consume()));
  return results;
}
