// modules/xiaohongshu/xhs-core/utils.ts
// Shared utilities for Xiaohongshu modules

import { randomBytes } from 'node:crypto';

/**
 * Generate a run ID in the format YYYYMMDD-HHMMSS-XXXXXX
 */
export function generateRunId(): string {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmmss = now.toISOString().slice(11, 19).replace(/:/g, '');
  const random = randomBytes(4).toString('hex').slice(0, 6);
  return `${yyyymmdd}-${hhmmss}-${random}`;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds.toString().padStart(2, '0')}s`;
}

/**
 * Parse CLI arguments for Xiaohongshu scripts
 */
export function parseXhsArgs(args: string[]): Record<string, any> {
  const minimist = require('minimist');
  return minimist(args, {
    string: ['keyword', 'profile', 'env', 'like-keywords', 'match-keywords', 'ocr-command'],
    boolean: ['dry-run', 'headless', 'foreground', 'do-homepage', 'do-images', 'do-comments', 'do-likes', 'do-ocr', 'no-dry-run'],
    number: ['target', 'max-notes', 'max-comments', 'max-likes', 'comment-rounds', 'tab-count', 'match-min-hits'],
    default: {
      'dry-run': true,
      headless: true,
      'do-homepage': true,
      'do-images': true,
      'do-comments': true,
      'do-likes': false,
      'do-ocr': false,
      'max-comments': 50,
      'max-likes': 2,
      'comment-rounds': 30,
      'tab-count': 4,
      'match-min-hits': 1,
      env: 'debug',
    },
  });
}

// Default export
export default {
  generateRunId,
  sleep,
  formatDuration,
  parseXhsArgs,
};
