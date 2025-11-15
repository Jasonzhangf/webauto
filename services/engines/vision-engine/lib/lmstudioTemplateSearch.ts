// @ts-nocheck
// LM Studio based template search (image-to-image) without local matching algorithms

import { prepareImage } from './lmstudioClient.js';

function env(key: string, d?: any) { return process.env[key] ?? d; }

function parseFnCall(text: string): { xy: [number,number] | null; wh: [number,number] | null } {
  try {
    if (text.includes('<function_call>') && text.includes('</function_call>')) {
      const s = text.indexOf('<function_call>') + '<function_call>'.length;
      const e = text.indexOf('</function_call>');
      let c = text.slice(s, e).trim();
      c = c.replace('```json', '').replace('```', '').trim();
      try {
        const data = JSON.parse(c);
        const coord = data?.arguments?.coordinate;
        const imgSize = data?.arguments?.image_size;
        let xy = Array.isArray(coord) && coord.length >= 2 ? [Number(coord[0]), Number(coord[1])] as [number,number] : null;
        const wh = Array.isArray(imgSize) && imgSize.length >= 2 ? [Number(imgSize[0]), Number(imgSize[1])] as [number,number] : null;
        if (!xy && Array.isArray((data as any).action) && (data as any).action.length >= 2) {
          xy = [Number((data as any).action[0]), Number((data as any).action[1])] as [number,number];
        }
        if (xy) return { xy, wh };
      } catch {}
      const mIn = c.match(/\[(\d+)\s*,\s*(\d+)\]/);
      if (mIn) return { xy: [Number(mIn[1]), Number(mIn[2])], wh: null };
    }
  } catch {}
  const m = text.match(/\[(\d+)\s*,\s*(\d+)\]/);
  if (m) return { xy: [Number(m[1]), Number(m[2])], wh: null };
  return { xy: null, wh: null };
}

function buildMessagesForTemplateSearch(instruction: string, baseDataUrl: string, templateDataUrl: string, provided: {w:number;h:number}) {
  const sys1 = { type: 'text', text: 'You are a helpful assistant.' };
  const sys2 = { type: 'text', text: [
    'You are given two images: the FIRST is a full screenshot, the SECOND is a small template cropped from the screenshot.',
    'Your task is to locate the template inside the screenshot and return the CENTER point of the best match.',
    '',
    'Output format strictly as:',
    '<function_call>',
    '{"name": "grounding", "arguments": {"coordinate": [x, y], "image_size": [width, height]}}',
    '</function_call>',
    'Where [x, y] are NORMALIZED [0.0, 1.0] coordinates RELATIVE TO THE FIRST IMAGE (the screenshot).',
  ].join('\n') };
  const sizeInfo = `Screenshot size (provided to you): ${provided.w}x${provided.h}.`;
  return [
    { role: 'system', content: [sys1, sys2] },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: baseDataUrl } },
      { type: 'image_url', image_url: { url: templateDataUrl } },
      { type: 'text', text: `${instruction}\n\n${sizeInfo}` }
    ]}
  ];
}

export async function searchTemplateWithLmStudio(body: any) {
  const ep = String(env('LMSTUDIO_ENDPOINT'));
  const model = String(env('LMSTUDIO_MODEL', 'mradermacher/ui-ins-7b-gguf/ui-ins-7b.q4_k_s.gguf'));
  const instruction = 'Find the location of the template within the screenshot.';

  const baseImage = String(body.image || '');
  const templateImage = String(body.template || '');
  if (!baseImage || !templateImage) return { success: false, error: 'image and template required' };

  const reqParams = (body && typeof body.parameters === 'object') ? body.parameters : {};
  const targetWidth = Number.isFinite(Number(reqParams.targetWidth)) ? Number(reqParams.targetWidth) : undefined;
  const targetHeight = Number.isFinite(Number(reqParams.targetHeight)) ? Number(reqParams.targetHeight) : undefined;
  const targetSquare = Number.isFinite(Number((reqParams as any).targetSquare)) ? Number((reqParams as any).targetSquare) : (env('VISION_TARGET_SQUARE') ? Number(env('VISION_TARGET_SQUARE')) : undefined);

  // Prepare base screenshot (unified size + optional letterbox)
  const prep = await prepareImage(baseImage, null, { targetWidth, targetHeight, targetSquare });

  // Build LM Studio request with both images
  const messages = buildMessagesForTemplateSearch(instruction, prep.providedDataUrl, templateImage, { w: prep.provided.w, h: prep.provided.h });
  const url = ep.replace(/\/$/, '') + '/chat/completions';
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, temperature: 0.0, max_tokens: 2000 }) });
  if (!r.ok) {
    const t = await r.text().catch(()=>(''));
    return { success: false, error: `LMStudio error: ${r.status} ${t}` };
  }
  const j = await r.json().catch(()=>({}));
  const content = j?.choices?.[0]?.message?.content || '';

  // Parse normalized coordinate
  const parsed = parseFnCall(content);
  let pxOrig: [number,number] | null = null;
  let pxResized: [number,number] | null = null;
  let norm: [number,number] | null = null;
  if (parsed.xy) {
    const [x, y] = parsed.xy;
    // treat as normalized if looks like [0,1]
    if (x >= 0 && x <= 1.01 && y >= 0 && y <= 1.01) {
      norm = [x, y];
      const pxProvided: [number,number] = [ Math.round(x * prep.provided.w), Math.round(y * prep.provided.h) ];
      const noPadX = Math.max(0, Math.min(pxProvided[0] - (prep as any).pad?.x || 0, Math.round(prep.extracted.w * prep.scale.x) - 1));
      const noPadY = Math.max(0, Math.min(pxProvided[1] - (prep as any).pad?.y || 0, Math.round(prep.extracted.h * prep.scale.y) - 1));
      const pxExtracted: [number,number] = [ Math.round(noPadX / prep.scale.x), Math.round(noPadY / prep.scale.y) ];
      const baseOffset = prep.offset;
      pxOrig = [ Math.max(0, Math.min(baseOffset.left + pxExtracted[0], (prep.extracted.w + baseOffset.left) - 1)), Math.max(0, Math.min(baseOffset.top + pxExtracted[1], (prep.extracted.h + baseOffset.top) - 1)) ];
    } else {
      // assume pixel relative to provided (padded)
      const pxProvided: [number,number] = [ Math.round(x), Math.round(y) ];
      const noPadX = Math.max(0, Math.min(pxProvided[0] - (prep as any).pad?.x || 0, Math.round(prep.extracted.w * prep.scale.x) - 1));
      const noPadY = Math.max(0, Math.min(pxProvided[1] - (prep as any).pad?.y || 0, Math.round(prep.extracted.h * prep.scale.y) - 1));
      const pxExtracted: [number,number] = [ Math.round(noPadX / prep.scale.x), Math.round(noPadY / prep.scale.y) ];
      const baseOffset = prep.offset;
      pxOrig = [ Math.max(0, Math.min(baseOffset.left + pxExtracted[0], (prep.extracted.w + baseOffset.left) - 1)), Math.max(0, Math.min(baseOffset.top + pxExtracted[1], (prep.extracted.h + baseOffset.top) - 1)) ];
      norm = [ pxOrig[0] / (prep.extracted.w + prep.offset.left), pxOrig[1] / (prep.extracted.h + prep.offset.top) ];
    }

    const padX = (prep as any).pad?.x || 0;
    const padY = (prep as any).pad?.y || 0;
    pxResized = [
      Math.max(0, Math.min(Math.round(((pxOrig[0] - prep.offset.left) * prep.scale.x) + padX), prep.provided.w - 1)),
      Math.max(0, Math.min(Math.round(((pxOrig[1] - prep.offset.top) * prep.scale.y) + padY), prep.provided.h - 1))
    ];
  }

  // Determine template original size for bbox mapping
  const [, tplB64] = templateImage.split(',');
  const tplBuf = Buffer.from(tplB64, 'base64');
  let tplW = 0, tplH = 0;
  try {
    const mod = await import('sharp'); const sharp = (mod as any).default || mod;
    const m = await sharp(tplBuf, { failOn: 'none' }).metadata();
    tplW = m.width || 0; tplH = m.height || 0;
  } catch {}

  let elements: any[] = [];
  if (pxOrig && tplW > 0 && tplH > 0) {
    const [ox, oy] = pxOrig;
    const halfW = Math.floor(tplW/2), halfH = Math.floor(tplH/2);
    const bbox = [ Math.max(0, ox - halfW), Math.max(0, oy - halfH), Math.min(prep.offset.left + prep.extracted.w, ox + halfW), Math.min(prep.offset.top + prep.extracted.h, oy + halfH) ];
    elements.push({ bbox, type: 'template_match', confidence: 0.6, description: `LMStudio template match at (${ox}, ${oy})` });
  }

  return {
    success: !!pxOrig,
    coordinate: pxOrig || null,
    elements,
    analysis: content,
    metadata: {
      mode: 'lmstudio-template-search',
      model,
      templateSize: { width: tplW, height: tplH },
      providedSize: prep.provided,
      extractedSize: prep.extracted,
      cropOrigin: prep.offset,
      padding: (prep as any).pad || { x:0, y:0 },
      scale: prep.scale,
      normalized: norm || null,
      resizedPixel: pxResized || null,
    }
  };
}
