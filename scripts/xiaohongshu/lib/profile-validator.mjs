// Profile validator - only allow manually created profiles
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_PROFILES_PATH = path.join(__dirname, 'allowed-profiles.json');

let allowedProfiles = [];

try {
  const config = JSON.parse(fs.readFileSync(ALLOWED_PROFILES_PATH, 'utf8'));
  allowedProfiles = config.allowedProfiles || [];
} catch (e) {
  console.error('[ProfileValidator] Failed to load allowed-profiles.json:', e.message);
  // Fallback to hardcoded list
  allowedProfiles = ['xiaohongshu_batch-1', 'xiaohongshu_batch-2'];
}

export function isProfileAllowed(profileId) {
  return allowedProfiles.includes(profileId);
}

export function validateProfile(profileId) {
  if (!isProfileAllowed(profileId)) {
    throw new Error(
      `[ProfileValidator] Profile '${profileId}' is not allowed. ` +
      `Only manually created profiles are permitted: ${allowedProfiles.join(', ')}. ` +
      `Please use --profile xiaohongshu_batch-1 or --profile xiaohongshu_batch-2`
    );
  }
  return true;
}

export function getAllowedProfiles() {
  return [...allowedProfiles];
}

export function assertProfileExists(profileId) {
  const profilePath = path.join(process.env.HOME || '/Users/fanzhang', '.webauto/profiles', profileId);
  if (!fs.existsSync(profilePath)) {
    throw new Error(
      `[ProfileValidator] Profile directory does not exist: ${profilePath}. ` +
      `Please create the profile manually using phase1-boot with --profile ${profileId}`
    );
  }
  return true;
}

export function validateProfileComplete(profileId) {
  validateProfile(profileId);
  assertProfileExists(profileId);
  return true;
}
