/**
 * Configuration management for wa CLI.
 * Config stored at ~/.webauto/config.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { ok, fail, warn } from './output.mjs';

const CONFIG_DIR = join(homedir(), '.webauto');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function configPath() {
  return CONFIG_FILE;
}

export function configDir() {
  return CONFIG_DIR;
}

export function loadConfig() {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    return { version: '1.0.0', profiles: {}, defaults: {} };
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (err) {
    warn(`Failed to read config: ${err.message}`);
    return { version: '1.0.0', profiles: {}, defaults: {} };
  }
}

export function saveConfig(config) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getProfile(config, profileId) {
  return config.profiles?.[profileId || 'default'] || null;
}

export function setProfile(config, profileId, data) {
  if (!config.profiles) config.profiles = {};
  config.profiles[profileId || 'default'] = {
    ...config.profiles[profileId || 'default'],
    ...data,
  };
  saveConfig(config);
}

export function getDefaults(config) {
  return config.defaults || {};
}
