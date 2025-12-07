#!/usr/bin/env node
import { fetchBranch } from './fetchBranch.js';

async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const token = process.argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
    args.set(key, value);
  }
  const profile = args.get('profile');
  const url = args.get('url');
  const path = args.get('path');
  if (!profile || !url || !path) {
    console.error('Usage: dom-branch:fetch --profile <id> --url <url> --path <domPath>');
    process.exit(1);
  }
  const res = await fetchBranch({ profile, url, path });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
