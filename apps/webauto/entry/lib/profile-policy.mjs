import { listProfiles } from './profilepool.mjs';
import { isProfileSaved } from './account-store.mjs';

const TEMP_PROFILE_PATTERNS = [
  /^test(?:$|[-_])/i,
  /^tmp(?:$|[-_])/i,
  /^temp(?:$|[-_])/i,
  /^profile-\d+$/i,
  /^debug(?:$|[-_])/i,
];

function normalizeProfileId(input) {
  return String(input || '').trim();
}

export function isTemporaryProfileId(profileId) {
  const id = normalizeProfileId(profileId);
  if (!id) return false;
  return TEMP_PROFILE_PATTERNS.some((pattern) => pattern.test(id));
}

export function assertProfileUsable(profileId) {
  const id = normalizeProfileId(profileId);
  if (!id) {
    throw new Error('profileId is required');
  }
  if (isTemporaryProfileId(id)) {
    throw new Error(`forbidden temporary profileId: ${id}`);
  }
  const profiles = listProfiles().profiles || [];
  if (!profiles.includes(id)) {
    throw new Error(`profile not found: ${id}. create/login account profile first`);
  }
  if (!isProfileSaved(id)) {
    throw new Error(`profile not saved: ${id}. require at least one valid social account binding`);
  }
  return id;
}

export function assertProfilesUsable(profileIds) {
  const list = Array.from(new Set((Array.isArray(profileIds) ? profileIds : [])
    .map((item) => normalizeProfileId(item))
    .filter(Boolean)));
  if (list.length === 0) {
    throw new Error('missing --profile/--profiles/--profilepool');
  }
  return list.map((profileId) => assertProfileUsable(profileId));
}
