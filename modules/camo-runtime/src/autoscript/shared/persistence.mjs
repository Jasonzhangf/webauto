/**
 * @module shared/persistence
 * Cross-platform file persistence utilities.
 * Source: extracted from xhs/persistence.mjs (generic I/O functions only).
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Ensure a directory exists (recursive).
 * @param {string} dirPath
 */
export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Read all rows from a JSONL file.
 * Returns empty array if file does not exist or is malformed.
 * @param {string} filePath
 * @returns {Promise<object[]>}
 */
export async function readJsonlRows(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Append rows to a JSONL file (creates dir + file if needed).
 * @param {string} filePath
 * @param {object[]} rows
 */
export async function appendJsonlRows(filePath, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  await ensureDir(path.dirname(filePath));
  const payload = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.appendFile(filePath, `${payload}\n`, 'utf8');
}

/**
 * Write a JSON file (creates dir if needed).
 * @param {string} filePath
 * @param {*} payload - Will be JSON.stringify'd
 */
export async function writeJsonFile(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

/**
 * Save base64-encoded PNG data to a file.
 * @param {string} filePath
 * @param {string} base64Data
 * @returns {Promise<string|null>} File path on success, null on empty input
 */
export async function savePngBase64(filePath, base64Data) {
  const payload = String(base64Data || '').trim();
  if (!payload) return null;
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, Buffer.from(payload, 'base64'));
  return filePath;
}

/**
 * Generic URL-based JSONL merge: dedup by key, append new rows.
 * @param {object} params
 * @param {string} params.filePath
 * @param {object[]} params.rows
 * @param {function} params.dedupKey - (row) => string
 * @returns {Promise<{filePath: string, added: number, existing: number, total: number}>}
 */
export async function mergeJsonl({ filePath, rows = [], dedupKey }) {
  const existing = await readJsonlRows(filePath);
  const seen = new Set(existing.map((row) => (typeof dedupKey === 'function' ? dedupKey(row) : '')).filter(Boolean));
  const added = [];
  for (const row of rows) {
    const key = typeof dedupKey === 'function' ? dedupKey(row) : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push(row);
  }
  await appendJsonlRows(filePath, added);
  return { filePath, added: added.length, existing: existing.length, total: existing.length + added.length };
}
