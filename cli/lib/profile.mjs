/**
 * Profile management utilities.
 */

import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { configDir, loadConfig, saveConfig } from './config.mjs';

const PROFILES_DIR = join(configDir(), 'profiles');

function ensureProfilesDir() {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

export function getProfilePath(profileId) {
  return join(PROFILES_DIR, profileId || 'default', 'profile.json');
}

export function profileExists(profileId) {
  return existsSync(getProfilePath(profileId));
}

export function createProfile(profileId, data = {}) {
  ensureProfilesDir();
  const profileDir = join(PROFILES_DIR, profileId);
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }
  const profileData = {
    platform: 'xiaohongshu',
    loginUrl: 'https://www.xiaohongshu.com',
    createdAt: new Date().toISOString(),
    ...data,
  };
  writeFileSync(
    getProfilePath(profileId),
    JSON.stringify(profileData, null, 2) + '\n',
    'utf-8',
  );
  return profileData;
}

export function readProfile(profileId) {
  const path = getProfilePath(profileId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function listProfiles() {
  ensureProfilesDir();
  return readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}
