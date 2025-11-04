// @ts-nocheck
// LM Studio client + coordinate mapping utilities for Vision Engine

function env(key: string, d?: any) {
  return process.env[key] ?? d;
}

export function lmEnabled(): boolean {
  return !!process.env.LMSTUDIO_ENDPOINT;
}

function getDimsFromDataUrl(dataUrl: string): { width: number; height: number } | null {
  try {
    const [, b64] = dataUrl.split(',');
    const buf = Buffer.from(b64, 'base64');
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      return { width: w, height: h };
    }
    // JPEG
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i+1];
      if (marker >= 0xC0 && marker <= 0xC3) {
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

function targetResize(orig: {width:number;height:number}) {
  const targetW = Number(env('VISION_TARGET_WIDTH', 1024));
  const targetH = env('VISION_TARGET_HEIGHT') ? Number(env('VISION_TARGET_HEIGHT')) : 0;
  if (targetH) {
    const scale = targetH / orig.height;
    return { width: Math.max(1, Math.round(orig.width * scale)), height: targetH, scaleX: scale, scaleY: scale };
  } else {
    const scale = targetW / orig.width;
    return { width: targetW, height: Math.max(1, Math.round(orig.height * scale)), scaleX: scale, scaleY: scale };
  }
}

function buildMessages(instruction: string, dataUrl: string, provided: {w:number;h:number}, opts?: { expectContainers?: boolean, expectItems?: boolean, expectBBoxes?: boolean }) {
  const sys1 = { type: 'text', text: 'You are a helpful assistant.' };
  const expectBoxes = !!opts?.expectBBoxes;
  const sys2 = (opts?.expectContainers || opts?.expectItems) ?
    { type: 'text', text: [
      'You are a GUI agent. You are given a single screenshot. Identify UI regions per instruction.',
      '',
      '## Required Output (strict):',
      'Return a json object with a reasoning process in <reasoning> tags, and a function call in <function_call> tags containing a containers object (and optionally items):',
      '```',
      '<reasoning>', '...', '</reasoning>', '',
      '<function_call>',
      '{"name":"grounding","arguments":{',
      '  "containers": {',
      (expectBoxes ? '    "list_bbox": [x1, y1, x2, y2],\n' : '    "list": [x, y],\n') +
      (expectBoxes ? '    "content_bbox": [x1, y1, x2, y2]\n' : '    "content": [x, y]\n'),
      '  },',
      (opts?.expectItems ? (expectBoxes ? '  "items": [[x1, y1, x2, y2], ...],' : '  "items": [[x, y], ...],') : ''),
      '  "image_size": [width, height]',
      '}}',
      '</function_call>',
      '```',
      '',
      'Rules:',
      '- Coordinates MUST be NORMALIZED [0.0, 1.0] relative to the PROVIDED image.',
      '- If you cannot produce normalized, you may use pixel coordinates AND include image_size to indicate the pixel resolution used.',
    ].join('\n') }
  :
    { type: 'text', text: [
      'You are a GUI agent. You are given a task and a single screenshot. You need to locate the target UI element per instruction.',
      '',
      '## Output Format (strict):',
      'Return a json object with a reasoning process in <reasoning> tags, a function name and arguments within <function_call> XML tags:',
      '```',
      '<reasoning>','...','</reasoning>','',
      '<function_call>',
      '{"name": "grounding", "arguments": {"action": "click", "coordinate": [x, y], "image_size": [width, height]}}',
      '</function_call>',
      '```',
      'Rules:',
      '- Coordinates MUST be NORMALIZED [0.0, 1.0] relative to the PROVIDED image.',
      '- If you cannot produce normalized, you may use pixel coordinates AND include image_size to indicate the pixel resolution used.',
    ].join('\n') };

  const sizeInfo = `Provided image size: ${provided.w}x${provided.h}.`;
  return [
    { role: 'system', content: [sys1, sys2] },
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: dataUrl } },
      { type: 'text', text: `${instruction}\n\n${sizeInfo}` }
    ]}
  ];
}

function parseFnCall(text: string): { xy: [number,number] | null; wh: [number,number] | null; containers?: any, items?: any[] } {
  try {
    if (text.includes('<function_call>') && text.includes('</function_call>')) {
      const s = text.indexOf('<function_call>') + '<function_call>'.length;
      const e = text.indexOf('</function_call>');
      let c = text.slice(s, e).trim();
      c = c.replace('```json', '').replace('```', '').trim();
      // Try to parse JSON first
      try {
        const data = JSON.parse(c);
        const args = (data && typeof data==='object' && 'arguments' in data) ? (data as any).arguments : data;
        const coord = args?.coordinate;
        const imgSize = args?.image_size;
        const containers = args?.containers || args?.container || null;
        const items = Array.isArray(args?.items) ? args.items : null;
        let xy = Array.isArray(coord) && coord.length >= 2 ? [Number(coord[0]), Number(coord[1])] as [number,number] : null;
        const wh = Array.isArray(imgSize) && imgSize.length >= 2 ? [Number(imgSize[0]), Number(imgSize[1])] as [number,number] : null;
        // Accept alternative schema: { "action": [x,y] }
        if (!xy && Array.isArray((data as any).action) && (data as any).action.length >= 2) {
          xy = [Number((data as any).action[0]), Number((data as any).action[1])] as [number,number];
        }
        const out: any = { xy, wh };
        if (containers && typeof containers === 'object') {
          const lc = containers.list || containers.list_container || containers.listContainer;
          const lcb = containers.list_bbox || containers.listBox || containers.listBBox || containers.list_rect;
          const cc = containers.content || containers.content_container || containers.contentContainer;
          const ccb = containers.content_bbox || containers.contentBox || containers.contentBBox || containers.content_rect;
          const obj: any = {};
          if (Array.isArray(lcb) && lcb.length>=4) obj.list_bbox = lcb.map((n:number)=>Number(n));
          if (Array.isArray(ccb) && ccb.length>=4) obj.content_bbox = ccb.map((n:number)=>Number(n));
          if (Array.isArray(lc) && lc.length>=2) obj.list = [Number(lc[0]), Number(lc[1])] as [number,number];
          if (Array.isArray(cc) && cc.length>=2) obj.content = [Number(cc[0]), Number(cc[1])] as [number,number];
          if (Object.keys(obj).length) out.containers = obj;
        }
        if (items) {
          // allow list of points or bboxes
          out.items = items.filter((p:any)=>Array.isArray(p)&&p.length>=2).map((p:any)=>p.map((n:number)=>Number(n)));
        }
        if (out.xy || out.containers || (out.items && out.items.length)) return out;
      } catch {}
      // Fallback: extract first [x, y] pair within the function_call block
      const mIn = c.match(/\[(\d+)\s*,\s*(\d+)\]/);
      if (mIn) return { xy: [Number(mIn[1]), Number(mIn[2])], wh: null } as any;
    }
  } catch {}
  // Try parse whole text as JSON
  try {
    const data = JSON.parse(text);
    const args = (data && typeof data==='object' && 'arguments' in data) ? (data as any).arguments : data;
    const coord = args?.coordinate;
    const imgSize = args?.image_size;
    const containers = args?.containers || args?.container || null;
    const items = Array.isArray(args?.items) ? args.items : null;
    const out: any = { xy: null, wh: null };
    if (Array.isArray(coord) && coord.length>=2) out.xy = [Number(coord[0]), Number(coord[1])];
    if (Array.isArray(imgSize) && imgSize.length>=2) out.wh = [Number(imgSize[0]), Number(imgSize[1])];
    if (containers && typeof containers === 'object') {
      const lc = containers.list || containers.list_container || containers.listContainer;
      const lcb = containers.list_bbox || containers.listBox || containers.listBBox || containers.list_rect;
      const cc = containers.content || containers.content_container || containers.contentContainer;
      const ccb = containers.content_bbox || containers.contentBox || containers.contentBBox || containers.content_rect;
      const obj: any = {};
      if (Array.isArray(lcb) && lcb.length>=4) obj.list_bbox = lcb.map((n:number)=>Number(n));
      if (Array.isArray(ccb) && ccb.length>=4) obj.content_bbox = ccb.map((n:number)=>Number(n));
      if (Array.isArray(lc) && lc.length>=2) obj.list = [Number(lc[0]), Number(lc[1])] as [number,number];
      if (Array.isArray(cc) && cc.length>=2) obj.content = [Number(cc[0]), Number(cc[1])] as [number,number];
      if (Object.keys(obj).length) out.containers = obj;
    }
    if (items) out.items = items;
    if (out.xy || out.containers || (out.items && out.items.length)) return out;
  } catch {}
  // Global fallback [x, y]
  const m = text.match(/\[(\d+)\s*,\s*(\d+)\]/);
  if (m) return { xy: [Number(m[1]), Number(m[2])], wh: null } as any;
  return { xy: null, wh: null } as any;
}

export async function handleWithLmStudio(body: any) {
  const ep = String(env('LMSTUDIO_ENDPOINT'));
  const model = String(env('LMSTUDIO_MODEL', 'mradermacher/ui-ins-7b-gguf/ui-ins-7b.q4_k_s.gguf'));
  const reqParams = (body && typeof body.parameters === 'object') ? body.parameters : {};
  const targetWidth = Number.isFinite(Number(reqParams.targetWidth)) ? Number(reqParams.targetWidth) : undefined;
  const targetHeight = Number.isFinite(Number(reqParams.targetHeight)) ? Number(reqParams.targetHeight) : undefined;
  const targetSquare = Number.isFinite(Number((reqParams as any).targetSquare)) ? Number((reqParams as any).targetSquare) : (env('VISION_TARGET_SQUARE') ? Number(env('VISION_TARGET_SQUARE')) : undefined);
  const instruction = body.query || '识别页面中的可交互元素';
  const dataUrl = String(body.image || '');
  if (!dataUrl) return { success: false, error: 'image required' };

  // 1) Decode original dims
  const dims = getDimsFromDataUrl(dataUrl);
  if (!dims) return { success: false, error: 'cannot read image dims' };
  const orig = { w: dims.width, h: dims.height };

  // 2) Crop & resize preparation (real image)
  const region = body.region && typeof body.region === 'object' ? body.region : null;
  const prep = await prepareImage(dataUrl, region, { targetWidth, targetHeight, targetSquare });

  // 3) Build request and call LM Studio with provided (prepared) image
  const expectContainers = !!(reqParams?.expectContainers);
  const messages = buildMessages(instruction, prep.providedDataUrl, { w: prep.provided.w, h: prep.provided.h }, { expectContainers });
  const url = ep.replace(/\/$/, '') + '/chat/completions';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.0, max_tokens: 2000 })
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>(''));
    return { success: false, error: `LMStudio error: ${r.status} ${t}` };
  }
  const j = await r.json().catch(()=>({}));
  const content = j?.choices?.[0]?.message?.content || '';

  // 4) Parse and map coordinates (from provided image back to original)
  const parsed = parseFnCall(content);
  let norm: [number,number] | null = null;
  let pxOrig: [number,number] | null = null;
  let pxResized: [number,number] | null = null;
  let containersNorm: any = {};
  let containersOrig: any = {};
  let containersResized: any = {};
  let itemsNorm: [number,number][] = [];
  let itemsOrig: [number,number][] = [];
  let itemsResized: [number,number][] = [];
  let itemsBoxesNorm: [number,number,number,number][] = [];
  let itemsBoxesOrig: [number,number,number,number][] = [];
  let itemsBoxesResized: [number,number,number,number][] = [];
  let containersBoxesNorm: any = {};
  let containersBoxesOrig: any = {};
  let containersBoxesResized: any = {};

  if (parsed.xy) {
    const [x, y] = parsed.xy;
    // treat as normalized if looks like [0,1] (relative to PROVIDED image, including padding if any)
    if (x >= 0 && x <= 1.01 && y >= 0 && y <= 1.01) {
      norm = [x, y];
      const pxProvided: [number,number] = [ Math.round(x * prep.provided.w), Math.round(y * prep.provided.h) ];
      const noPadX = Math.max(0, Math.min(pxProvided[0] - (prep as any).pad?.x || 0, Math.round(prep.extracted.w * prep.scale.x) - 1));
      const noPadY = Math.max(0, Math.min(pxProvided[1] - (prep as any).pad?.y || 0, Math.round(prep.extracted.h * prep.scale.y) - 1));
      const pxExtracted: [number,number] = [ Math.round(noPadX / prep.scale.x), Math.round(noPadY / prep.scale.y) ];
      const baseOffset = prep.offset; // { left, top }
      pxOrig = [ Math.max(0, Math.min(baseOffset.left + pxExtracted[0], orig.w-1)), Math.max(0, Math.min(baseOffset.top + pxExtracted[1], orig.h-1)) ];
    } else if (parsed.wh && parsed.wh[0] > 0 && parsed.wh[1] > 0) {
      // pixel relative to provided image_size
      const pxProvided: [number,number] = [ Math.round(x), Math.round(y) ];
      const noPadX = Math.max(0, Math.min(pxProvided[0] - (prep as any).pad?.x || 0, Math.round(prep.extracted.w * prep.scale.x) - 1));
      const noPadY = Math.max(0, Math.min(pxProvided[1] - (prep as any).pad?.y || 0, Math.round(prep.extracted.h * prep.scale.y) - 1));
      const pxExtracted: [number,number] = [ Math.round(noPadX / prep.scale.x), Math.round(noPadY / prep.scale.y) ];
      const baseOffset = prep.offset;
      pxOrig = [ Math.max(0, Math.min(baseOffset.left + pxExtracted[0], orig.w-1)), Math.max(0, Math.min(baseOffset.top + pxExtracted[1], orig.h-1)) ];
      norm = [ pxOrig[0] / orig.w, pxOrig[1] / orig.h ];
    } else {
      // assume pixel relative to provided
      const pxProvided: [number,number] = [ Math.round(x), Math.round(y) ];
      const noPadX = Math.max(0, Math.min(pxProvided[0] - (prep as any).pad?.x || 0, Math.round(prep.extracted.w * prep.scale.x) - 1));
      const noPadY = Math.max(0, Math.min(pxProvided[1] - (prep as any).pad?.y || 0, Math.round(prep.extracted.h * prep.scale.y) - 1));
      const pxExtracted: [number,number] = [ Math.round(noPadX / prep.scale.x), Math.round(noPadY / prep.scale.y) ];
      const baseOffset = prep.offset;
      pxOrig = [ Math.max(0, Math.min(baseOffset.left + pxExtracted[0], orig.w-1)), Math.max(0, Math.min(baseOffset.top + pxExtracted[1], orig.h-1)) ];
      norm = [ pxOrig[0] / orig.w, pxOrig[1] / orig.h ];
    }

    // resized mapping (provided image), include padding if any
    const padX = (prep as any).pad?.x || 0;
    const padY = (prep as any).pad?.y || 0;
    pxResized = [
      Math.max(0, Math.min(Math.round(((pxOrig[0] - prep.offset.left) * prep.scale.x) + padX), prep.provided.w-1)),
      Math.max(0, Math.min(Math.round(((pxOrig[1] - prep.offset.top) * prep.scale.y) + padY), prep.provided.h-1))
    ];
  }

  // 5) Bounds check for provided coords
  const inResizedBounds = !!pxResized && pxResized[0] >= 0 && pxResized[0] < prep.provided.w && pxResized[1] >= 0 && pxResized[1] < prep.provided.h;

  // 6) Build element bbox on original image
  let elements = [] as any[];
  let actions = [] as any[];
  // Helper to map provided-space coordinate to original pixel
  function mapProvidedToOrig(pair: [number,number], isNorm: boolean): { orig:[number,number], resized:[number,number], norm:[number,number] } {
    let ox=null as any, rz=null as any, nm=null as any;
    const [x,y]=pair;
    if (isNorm) {
      const pxProvided: [number,number] = [ Math.round(x * prep.provided.w), Math.round(y * prep.provided.h) ];
      const noPadX = Math.max(0, Math.min(pxProvided[0] - (prep as any).pad?.x || 0, Math.round(prep.extracted.w * prep.scale.x) - 1));
      const noPadY = Math.max(0, Math.min(pxProvided[1] - (prep as any).pad?.y || 0, Math.round(prep.extracted.h * prep.scale.y) - 1));
      const pxExtracted: [number,number] = [ Math.round(noPadX / prep.scale.x), Math.round(noPadY / prep.scale.y) ];
      const baseOffset = prep.offset;
      const o: [number,number] = [ Math.max(0, Math.min(baseOffset.left + pxExtracted[0], orig.w-1)), Math.max(0, Math.min(baseOffset.top + pxExtracted[1], orig.h-1)) ];
      const padX = (prep as any).pad?.x || 0; const padY = (prep as any).pad?.y || 0;
      const rzz: [number,number] = [ Math.max(0, Math.min(Math.round(((o[0] - prep.offset.left) * prep.scale.x) + padX), prep.provided.w-1)), Math.max(0, Math.min(Math.round(((o[1] - prep.offset.top) * prep.scale.y) + padY), prep.provided.h-1)) ];
      return { orig: o, resized: rzz, norm: [o[0]/orig.w, o[1]/orig.h] as [number,number] };
    } else {
      const pxProvided: [number,number] = [ Math.round(x), Math.round(y) ];
      const noPadX = Math.max(0, Math.min(pxProvided[0] - (prep as any).pad?.x || 0, Math.round(prep.extracted.w * prep.scale.x) - 1));
      const noPadY = Math.max(0, Math.min(pxProvided[1] - (prep as any).pad?.y || 0, Math.round(prep.extracted.h * prep.scale.y) - 1));
      const pxExtracted: [number,number] = [ Math.round(noPadX / prep.scale.x), Math.round(noPadY / prep.scale.y) ];
      const baseOffset = prep.offset;
      const o: [number,number] = [ Math.max(0, Math.min(baseOffset.left + pxExtracted[0], orig.w-1)), Math.max(0, Math.min(baseOffset.top + pxExtracted[1], orig.h-1)) ];
      const padX = (prep as any).pad?.x || 0; const padY = (prep as any).pad?.y || 0;
      const rzz: [number,number] = [ Math.max(0, Math.min(Math.round(((o[0] - prep.offset.left) * prep.scale.x) + padX), prep.provided.w-1)), Math.max(0, Math.min(Math.round(((o[1] - prep.offset.top) * prep.scale.y) + padY), prep.provided.h-1)) ];
      return { orig: o, resized: rzz, norm: [o[0]/orig.w, o[1]/orig.h] as [number,number] };
    }
  }

  // New: containers mapping if provided
  if ((parsed as any).containers) {
    const cs = (parsed as any).containers;
    function isNormalized(pair:[number,number]){ return pair && pair[0] >=0 && pair[0] <= 1.01 && pair[1] >=0 && pair[1] <= 1.01; }
    const mapRectProvidedToOrig = (rect:number[], isNorm:boolean) => {
      // rect: [x1,y1,x2,y2]
      const p1 = mapProvidedToOrig([Number(rect[0]), Number(rect[1])] as [number,number], isNorm);
      const p2 = mapProvidedToOrig([Number(rect[2]), Number(rect[3])] as [number,number], isNorm);
      const o:[number,number,number,number] = [ Math.min(p1.orig[0], p2.orig[0]), Math.min(p1.orig[1], p2.orig[1]), Math.max(p1.orig[0], p2.orig[0]), Math.max(p1.orig[1], p2.orig[1]) ];
      const r:[number,number,number,number] = [ Math.min(p1.resized[0], p2.resized[0]), Math.min(p1.resized[1], p2.resized[1]), Math.max(p1.resized[0], p2.resized[0]), Math.max(p1.resized[1], p2.resized[1]) ];
      const n:[number,number,number,number] = [ o[0]/orig.w, o[1]/orig.h, o[2]/orig.w, o[3]/orig.h ];
      return { orig:o, resized:r, norm:n };
    };
    if (Array.isArray(cs.list_bbox) && cs.list_bbox.length>=4) {
      const rect=cs.list_bbox.map((n:number)=>Number(n));
      const m = mapRectProvidedToOrig(rect, rect.every((v:number)=>v>=0 && v<=1.01));
      containersBoxesNorm.list = m.norm; containersBoxesOrig.list = m.orig; containersBoxesResized.list = m.resized;
    }
    if (Array.isArray(cs.content_bbox) && cs.content_bbox.length>=4) {
      const rect=cs.content_bbox.map((n:number)=>Number(n));
      const m = mapRectProvidedToOrig(rect, rect.every((v:number)=>v>=0 && v<=1.01));
      containersBoxesNorm.content = m.norm; containersBoxesOrig.content = m.orig; containersBoxesResized.content = m.resized;
    }
    if (cs.list && Array.isArray(cs.list)) {
      const p = cs.list as [number,number];
      const m = mapProvidedToOrig(p, isNormalized(p));
      containersNorm.list = m.norm; containersOrig.list = m.orig; containersResized.list = m.resized;
    }
    if (cs.content && Array.isArray(cs.content)) {
      const p = cs.content as [number,number];
      const m = mapProvidedToOrig(p, isNormalized(p));
      containersNorm.content = m.norm; containersOrig.content = m.orig; containersResized.content = m.resized;
    }
  }
  // New: items mapping if provided
  if (Array.isArray((parsed as any).items) && (parsed as any).items.length) {
    const arr = (parsed as any).items as [number,number][];
    function isNormalized(pair:[number,number]){ return pair && pair[0] >=0 && pair[0] <= 1.01 && pair[1] >=0 && pair[1] <= 1.01; }
    const mapRectProvidedToOrig = (rect:number[], isNorm:boolean) => {
      const p1 = mapProvidedToOrig([Number(rect[0]), Number(rect[1])] as [number,number], isNorm);
      const p2 = mapProvidedToOrig([Number(rect[2]), Number(rect[3])] as [number,number], isNorm);
      const o:[number,number,number,number] = [ Math.min(p1.orig[0], p2.orig[0]), Math.min(p1.orig[1], p2.orig[1]), Math.max(p1.orig[0], p2.orig[0]), Math.max(p1.orig[1], p2.orig[1]) ];
      const r:[number,number,number,number] = [ Math.min(p1.resized[0], p2.resized[0]), Math.min(p1.resized[1], p2.resized[1]), Math.max(p1.resized[0], p2.resized[0]), Math.max(p1.resized[1], p2.resized[1]) ];
      const n:[number,number,number,number] = [ o[0]/orig.w, o[1]/orig.h, o[2]/orig.w, o[3]/orig.h ];
      return { orig:o, resized:r, norm:n };
    };
    for (const p of arr) {
      if (Array.isArray(p) && p.length>=4) {
        const m = mapRectProvidedToOrig(p.map(Number), p.every((v:number)=>v>=0 && v<=1.01));
        itemsBoxesNorm.push(m.norm); itemsBoxesOrig.push(m.orig); itemsBoxesResized.push(m.resized);
      } else if (Array.isArray(p) && p.length>=2) {
        const m = mapProvidedToOrig([Number(p[0]), Number(p[1])] as [number,number], isNormalized([Number(p[0]), Number(p[1])] as [number,number]));
        itemsNorm.push(m.norm); itemsOrig.push(m.orig); itemsResized.push(m.resized);
      }
    }
  }
  if (pxOrig) {
    const [ox, oy] = pxOrig;
    // Only construct bbox if caller specified a bbox size on PROVIDED image.
    const p = (reqParams as any)?.bbox ?? (reqParams as any)?.bboxSize;
    if (Number.isFinite(Number(p))) {
      const bboxProvidedPx = Math.max(1, Math.round(Number(p)));
      const halfX = Math.ceil((bboxProvidedPx / prep.scale.x) / 2);
      const halfY = Math.ceil((bboxProvidedPx / prep.scale.y) / 2);
      const bbox = [
        Math.max(0, ox - halfX),
        Math.max(0, oy - halfY),
        Math.min(orig.w, ox + halfX),
        Math.min(orig.h, oy + halfY)
      ];
      elements.push({ bbox, text: body.query, type: 'ui_element', confidence: 0.7, description: `LMStudio coordinate mapped to original image (${ox}, ${oy})` });
      if (String(body.query||'').toLowerCase().includes('click') || body.query.includes('点击')) {
        actions.push({ type: 'click', target: { bbox }, reason: `Click per instruction: ${body.query}` });
      }
    }
  }
  // Add container elements if requested bbox size provided and containers exist
  const bboxParam = (reqParams as any)?.bbox ?? (reqParams as any)?.bboxSize;
  if (Number.isFinite(Number(bboxParam))) {
    const bboxProvidedPx = Math.max(1, Math.round(Number(bboxParam)));
    const halfX = Math.ceil((bboxProvidedPx / prep.scale.x) / 2);
    const halfY = Math.ceil((bboxProvidedPx / prep.scale.y) / 2);
    function boxAt(o:[number,number]){ return [ Math.max(0, o[0]-halfX), Math.max(0, o[1]-halfY), Math.min(orig.w, o[0]+halfX), Math.min(orig.h, o[1]+halfY) ]; }
    if (containersOrig.list) elements.push({ bbox: boxAt(containersOrig.list), type: 'list_container', confidence: 0.6, description: `list container at (${containersOrig.list[0]}, ${containersOrig.list[1]})` });
    if (containersOrig.content) elements.push({ bbox: boxAt(containersOrig.content), type: 'list_content_container', confidence: 0.6, description: `list content at (${containersOrig.content[0]}, ${containersOrig.content[1]})` });
    if (itemsOrig.length) {
      for (const it of itemsOrig) elements.push({ bbox: boxAt(it), type: 'result_item_container', confidence: 0.55, description: `item at (${it[0]}, ${it[1]})` });
    }
  }
  // If explicit container bboxes exist, add them as elements too
  function pushRect(b:[number,number,number,number], type:string, desc:string){ elements.push({ bbox: [Math.max(0,b[0]),Math.max(0,b[1]),Math.min(orig.w,b[2]),Math.min(orig.h,b[3])], type, confidence: 0.65, description: desc }); }
  if (containersBoxesOrig.list) pushRect(containersBoxesOrig.list, 'list_container_bbox', 'list container bbox');
  if (containersBoxesOrig.content) pushRect(containersBoxesOrig.content, 'list_content_container_bbox', 'list content container bbox');
  if (itemsBoxesOrig.length) {
    for (const b of itemsBoxesOrig) pushRect(b, 'result_item_container_bbox', 'result item bbox');
  }

  const hasContainers = !!(containersOrig.list || containersOrig.content);
  return {
    success: !!pxOrig || hasContainers,
    elements,
    actions,
    analysis: content,
    metadata: {
      mode: 'lmstudio',
      model,
      originalSize: { width: orig.w, height: orig.h },
      cropOrigin: prep.offset,
      padding: (prep as any).pad || { x: 0, y: 0 },
      extractedSize: prep.extracted,
      providedSize: prep.provided,
      scale: prep.scale,
      target: { width: targetWidth || null, height: targetHeight || null },
      normalized: norm || null,
      originalPixel: pxOrig || null,
      resizedPixel: pxResized || null,
      resizedInBounds: inResizedBounds,
      containers: {
        normalized: containersNorm,
        originalPixel: containersOrig,
        resizedPixel: containersResized,
      },
      containerBBoxes: {
        normalized: containersBoxesNorm,
        originalPixel: containersBoxesOrig,
        resizedPixel: containersBoxesResized,
      },
      items: {
        normalized: itemsNorm,
        originalPixel: itemsOrig,
        resizedPixel: itemsResized,
      },
      itemsBBoxes: {
        normalized: itemsBoxesNorm,
        originalPixel: itemsBoxesOrig,
        resizedPixel: itemsBoxesResized,
      }
    }
  };
}

// Helpers using sharp for crop + resize
export async function prepareImage(dataUrl: string, region: any, opts?: { targetWidth?: number; targetHeight?: number; targetSquare?: number }) {
  const mod = await import('sharp');
  const sharp = (mod as any).default || mod;
  const [meta, b64] = dataUrl.split(',');
  const input = Buffer.from(b64, 'base64');
  let img = sharp(input, { failOn: 'none' });
  const metaInfo = await img.metadata();
  const origW = metaInfo.width || 0;
  const origH = metaInfo.height || 0;
  const offset = { left: 0, top: 0 };
  let extractedW = origW, extractedH = origH;
  if (region && typeof region === 'object') {
    const left = Math.max(0, Number(region.x||0));
    const top = Math.max(0, Number(region.y||0));
    const width = Math.min(origW - left, Number(region.width||origW));
    const height = Math.min(origH - top, Number(region.height||origH));
    img = img.extract({ left, top, width, height });
    offset.left = left; offset.top = top;
    extractedW = width; extractedH = height;
  }
  // Resize policy:
  // - If targetSquare provided: letterbox into square (record pad and scale)
  // - Else if targetW/H provided: resize keeping aspect (no pad)
  // - Else: no resize
  const tsq = Number.isFinite(Number(opts?.targetSquare)) ? Number(opts?.targetSquare) : 0;
  const targetW = Number.isFinite(Number(opts?.targetWidth)) ? Number(opts?.targetWidth) : 0;
  const targetH = Number.isFinite(Number(opts?.targetHeight)) ? Number(opts?.targetHeight) : 0;
  let providedW = extractedW, providedH = extractedH;
  let pad = { x: 0, y: 0 } as { x:number; y:number };
  let scale = { x: 1, y: 1 };
  let providedDataUrl: string;

  if (tsq > 0) {
    const s = Math.min(tsq / extractedW, tsq / extractedH);
    const scaledW = Math.max(1, Math.round(extractedW * s));
    const scaledH = Math.max(1, Math.round(extractedH * s));
    pad.x = Math.max(0, Math.floor((tsq - scaledW) / 2));
    pad.y = Math.max(0, Math.floor((tsq - scaledH) / 2));
    providedW = tsq; providedH = tsq;
    scale = { x: scaledW / extractedW, y: scaledH / extractedH };
    const resizedBuf = await img.resize({ width: scaledW, height: scaledH }).png().toBuffer();
    const canvas = sharp({ create: { width: tsq, height: tsq, channels: 3, background: { r: 0, g: 0, b: 0 } } });
    const composed = await canvas.composite([{ input: resizedBuf, left: pad.x, top: pad.y }]).png().toBuffer();
    providedDataUrl = 'data:image/png;base64,' + composed.toString('base64');
  } else if (targetW > 0 || targetH > 0) {
    if (targetH > 0) {
      providedH = targetH;
      providedW = Math.max(1, Math.round(extractedW * (targetH / extractedH)));
    } else {
      providedW = targetW > 0 ? targetW : extractedW;
      providedH = Math.max(1, Math.round(extractedH * (providedW / extractedW)));
    }
    const resized = await img.resize({ width: providedW, height: providedH }).png().toBuffer();
    providedDataUrl = 'data:image/png;base64,' + resized.toString('base64');
    scale = { x: providedW / extractedW, y: providedH / extractedH };
  } else {
    const out = await img.png().toBuffer();
    providedDataUrl = 'data:image/png;base64,' + out.toString('base64');
    scale = { x: 1, y: 1 };
  }
  return {
    providedDataUrl,
    offset,
    extracted: { w: extractedW, h: extractedH },
    provided: { w: providedW, h: providedH },
    scale,
    pad
  };
}
