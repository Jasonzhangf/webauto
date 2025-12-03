#!/usr/bin/env node
// Post a local JS file (or inline) to Workflow API /browser/eval for the given session
import { readFileSync, existsSync } from 'node:fs';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node scripts/dev/eval-in-session.mjs <sessionId> <file.js|--code="JS..."> [--host=http://127.0.0.1:7701]');
    process.exit(1);
  }
  const sessionId = args[0];
  let codeArg = args[1];
  let host = 'http://127.0.0.1:7701';
  for (const a of args.slice(2)) {
    if (a.startsWith('--host=')) host = a.slice('--host='.length);
  }
  let script = '';
  if (codeArg.startsWith('--code=')) {
    script = codeArg.slice('--code='.length);
  } else {
    if (!existsSync(codeArg)) {
      console.error('File not found:', codeArg);
      process.exit(2);
    }
    script = readFileSync(codeArg, 'utf8');
  }
  const res = await fetch(host + '/browser/eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, script })
  }).then(r => r.json()).catch(e => ({ success: false, error: String(e) }));
  if (!res || !res.success) {
    console.error('Eval failed:', res?.error || 'unknown');
    process.exit(1);
  }
  console.log('Eval OK:', JSON.stringify(res.value));
}

main().catch(e => { console.error(e); process.exit(1); });

