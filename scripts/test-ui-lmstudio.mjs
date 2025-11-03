#!/usr/bin/env node
// Test UI grounding via LM Studio (OpenAI-compatible API)
// Usage:
//   node scripts/test-ui-lmstudio.mjs --image path/to/image.png --instruction "Click the 'Search' button" \
//        [--endpoint http://localhost:1234/v1] [--model qwen2.5vl]

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { endpoint: process.env.LMSTUDIO_ENDPOINT || 'http://localhost:1234/v1', model: process.env.LMSTUDIO_MODEL || '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = a.slice(2, eq > 0 ? eq : undefined);
    const val = eq > 0 ? a.slice(eq + 1) : argv[++i];
    if (!key) continue;
    if (['image','instruction','endpoint','model'].includes(key)) args[key] = val;
  }
  if (!args.image || !args.instruction) {
    console.error('Usage: node scripts/test-ui-lmstudio.mjs --image <path> --instruction "..." [--endpoint http://localhost:1234/v1] [--model <name>]');
    process.exit(1);
  }
  return args;
}

function toDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = (path.extname(filePath).slice(1) || 'png').toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function buildMessages(instruction, dataUrl, originalSize) {
  const sys1 = { type: 'text', text: 'You are a helpful assistant.' };
  const sys2 = { type: 'text', text: [
    'You are a GUI agent. You are given a task and your action history, with screenshots. You need to perform the next action to complete the task.',
    '',
    '## Output Format',
    'Return a json object with a reasoning process in <reasoning> tags, a function name and arguments within <function_call> XML tags:',
    '```',
    '<reasoning>','...','</reasoning>','',
    '<function_call>',
    '{"name": "grounding", "arguments": {"action": "click", "coordinate": [x, y], "image_size": [width, height]}}',
    '</function_call>',
    '```',
    ' represents the following item of the action space:',
    '## Action Space{"action": "click", "coordinate": [x, y]}',
    '',
    'Additionally, include "image_size": [width, height] in the function arguments to indicate the effective image resolution you used for coordinate calculation. If you cannot determine it, return the actual pixel width and height you used after preprocessing.',
    'Your task is to accurately locate a UI element based on the instruction. You should first analyze instruction in <reasoning> tags and finally output the function in <function_call> tags.'
  ].join('\n') };

  const sizeInfo = `Original image size: ${originalSize.width}x${originalSize.height}. Always return NORMALIZED coordinates in range [0.0, 1.0] relative to the ORIGINAL image. Do NOT return pixel coordinates.`;

  return [
    { role: 'system', content: [sys1, sys2] },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: `${instruction}\n\n${sizeInfo}` }
    ]}
  ];
}

function parseCoordinates(text) {
  try {
    if (text.includes('<function_call>') && text.includes('</function_call>')) {
      const s = text.indexOf('<function_call>') + '<function_call>'.length;
      const e = text.indexOf('</function_call>');
      let c = text.slice(s, e).trim();
      c = c.replace('```json', '').replace('```', '').trim();
      const data = JSON.parse(c);
      const coord = data?.arguments?.coordinate;
      const imgSize = data?.arguments?.image_size;
      const xy = Array.isArray(coord) && coord.length >= 2 ? [Number(coord[0]), Number(coord[1])] : null;
      const wh = Array.isArray(imgSize) && imgSize.length >= 2 ? [Number(imgSize[0]), Number(imgSize[1])] : null;
      if (xy) return { xy, wh };
    }
    const m = text.match(/\[(\d+)\s*,\s*(\d+)\]/);
    if (m) return [Number(m[1]), Number(m[2])];
  } catch {}
  return { xy: [-1, -1], wh: null };
}

async function main() {
  const { image, instruction, endpoint, model } = parseArgs(process.argv);
  const dataUrl = toDataUrl(image);
  const dims0 = await getImageDimsFromDataUrl(dataUrl);
  const messages = buildMessages(instruction, dataUrl, dims0 || { width: 0, height: 0 });

  const url = `${endpoint.replace(/\/$/,'')}/chat/completions`;
  const body = {
    model: model || 'qwen2.5vl',
    messages,
    temperature: 0.0,
    max_tokens: 128
  };

  console.log('POST', url);
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text().catch(()=>(''));
    console.error('Request failed:', r.status, txt);
    process.exit(1);
  }
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content || '';
  console.log('\n=== Raw Response ===\n' + content + '\n====================');
  let parsed = parseCoordinates(content);
  let [cx, cy] = parsed.xy;
  if (cx >= 0 && cy >= 0) {
    // If values look normalized, convert to pixels using original file dims (read via canvas helper)
    const dims = await getImageDimsFromDataUrl(dataUrl);
    if (dims && cx >= 0 && cx <= 1.01 && cy >= 0 && cy <= 1.01) {
      const px = Math.max(0, Math.min(Math.round(cx * dims.width), dims.width - 1));
      const py = Math.max(0, Math.min(Math.round(cy * dims.height), dims.height - 1));
      console.log(`\n✅ Normalized -> pixel: (${px}, ${py}) from (${cx.toFixed(4)}, ${cy.toFixed(4)}) on ${dims.width}x${dims.height}`);
    } else if (dims && parsed.wh && parsed.wh[0] > 0 && parsed.wh[1] > 0) {
      const [wEff, hEff] = parsed.wh;
      const px = Math.max(0, Math.min(Math.round((cx / wEff) * dims.width), dims.width - 1));
      const py = Math.max(0, Math.min(Math.round((cy / hEff) * dims.height), dims.height - 1));
      console.log(`\n✅ Scaled from effective size ${wEff}x${hEff} -> pixel: (${px}, ${py}) from (${cx}, ${cy}) on ${dims.width}x${dims.height}`);
    } else {
      console.log(`\n✅ Parsed coordinate: (${cx}, ${cy})`);
    }
  } else {
    console.log('\n❌ Could not parse coordinates from response.');
    process.exitCode = 2;
  }
}

// Helpers to get dims in Node: decode base64 and use canvas via OffscreenCanvas (Node 20+ experimental) or fallback to pngjs
async function getImageDimsFromDataUrl(dataUrl) {
  try {
    const [meta, b64] = dataUrl.split(',');
    const buf = Buffer.from(b64, 'base64');
    const sig = buf.subarray(0, 8).toString('binary');
    // PNG
    if (sig.startsWith('\x89PNG')) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      return { width: w, height: h };
    }
    // JPEG (very simple SOF search)
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i+1];
      if (marker >= 0xC0 && marker <= 0xC3) {
        const blockLen = buf.readUInt16BE(i+2);
        const h = buf.readUInt16BE(i+5);
        const w = buf.readUInt16BE(i+7);
        return { width: w, height: h };
      } else {
        const skip = buf.readUInt16BE(i+2);
        i += 2 + skip;
      }
    }
  } catch {}
  return null;
}

main().catch(e => { console.error(e); process.exit(1); });
