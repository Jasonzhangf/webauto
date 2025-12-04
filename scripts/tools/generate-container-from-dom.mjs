#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';

function getFlag(name, fallback = '') {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function uniquePush(list, value) {
  if (!value || list.includes(value)) return;
  list.push(value);
}

function selectorFromElement(element) {
  if (!element) return null;
  if (element.id) {
    return `#${element.id}`;
  }
  const classes = Array.from(element.classList || []);
  if (classes.length) {
    return `${element.tagName}.${classes.join('.')}`.toLowerCase();
  }
  return element.tagName.toLowerCase();
}

function collectDescendants(element, maxItems = 4) {
  const queue = [element];
  const picks = [];
  while (queue.length && picks.length < maxItems) {
    const current = queue.shift();
    if (!current) continue;
    for (const child of Array.from(current.children || [])) {
      const css = selectorFromElement(child);
      if (css && css.length < 120) {
        uniquePush(picks, css);
        if (picks.length >= maxItems) break;
      }
      queue.push(child);
    }
  }
  return picks;
}

async function main() {
  const fixture = getFlag('--fixture');
  const url = getFlag('--url');
  const site = getFlag('--site', 'cbu');
  const id = getFlag('--id');
  const selector = getFlag('--selector');
  const name = getFlag('--name', id);
  if (!fixture || !url || !site || !id) {
    console.error('Usage: generate-container-from-dom.mjs --fixture <file> --url <url> --site <key> --id <id> [--selector <css>]');
    process.exit(1);
  }
  const html = fs.readFileSync(fixture, 'utf-8');
  const { document } = parseHTML(html);
  let root = selector ? document.querySelector(selector) : null;
  if (!root) {
    root = document.body || document.documentElement;
  }
  if (!root) {
    throw new Error('Unable to locate root element');
  }
  const selectors = [];
  if (root.id) {
    selectors.push({ css: `#${root.id}`, variant: 'primary', score: 1 });
  }
  const classes = Array.from(root.classList || []);
  if (classes.length) {
    selectors.push({ css: `${root.tagName}.${classes.join('.')}`.toLowerCase(), variant: 'structure', score: 0.8 });
  }
  selectors.push({ css: root.tagName.toLowerCase(), variant: 'fallback', score: 0.6 });

  const requiredDesc = collectDescendants(root, 4);
  const metadata = {};
  if (requiredDesc.length) {
    metadata.required_descendants_any = requiredDesc;
  }

  const pagePatterns = [];
  if (url) {
    const parsed = new URL(url);
    const host = parsed.hostname;
    uniquePush(pagePatterns, host);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length) {
      uniquePush(pagePatterns, `*${segments[0]}*`);
    }
  }

  const container = {
    id,
    name,
    type: 'page',
    page_patterns: pagePatterns,
    selectors,
    metadata,
    capabilities: ['highlight', 'find-child', 'scroll'],
    children: [],
  };

  const targetDir = path.join('container-library', site, id);
  ensureDir(targetDir);
  const targetFile = path.join(targetDir, 'container.json');
  fs.writeFileSync(targetFile, JSON.stringify(container, null, 2), 'utf-8');
  console.log(`Generated container ${id} -> ${targetFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
