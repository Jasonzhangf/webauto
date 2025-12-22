// 容器动作节点：在作用域内对指定容器名执行动作（初期支持 click）
import BaseNode from './BaseNode';
import { loadLibrary, getSiteKey } from '../ContainerResolver.js';
import { getContainerDef, resolveQueryList } from '../ContainerResolver.js';

function resolveTargetFrame(page, frameCfg = null) {
  try {
    if (!frameCfg) return null;
    const frames = page.frames();
    if (frameCfg.urlPattern) { try { const re=new RegExp(frameCfg.urlPattern); const f=frames.find(fr=>re.test(fr.url())); if (f) return f; } catch {} }
    if (frameCfg.urlIncludes) { const f=frames.find(fr=>fr.url().includes(frameCfg.urlIncludes)); if (f) return f; }
    if (frameCfg.name) { const f=frames.find(fr => fr.name && fr.name()===frameCfg.name); if (f) return f; }
    if (typeof frameCfg.index === 'number' && frames[frameCfg.index]) return frames[frameCfg.index];
  } catch {}
  return null;
}

export default class ContainerActionNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) { super(); this.name='ContainerActionNode'; this.description='在作用域内对容器名执行动作（click/type/fill）'; }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, variables, engine } = context;
    if (!page) return { success:false, error:'no page' };
    const name = config?.containerName; if (!name) return { success:false, error:'containerName required' };
    const scopeVar = config?.scopeVar;
    const action = (config?.action||'click').toLowerCase();
    try{
      let scopeSelector = scopeVar ? variables.get(scopeVar) : null;
      if (!scopeSelector) {
        try { scopeSelector = engine?.focus?.getFocus()?.scopeSelector || null; } catch {}
      }
      if (!scopeSelector) return { success:false, error:`scope missing: ${scopeVar||'engine.focus'}` };
      const lib = loadLibrary(); const siteKey = getSiteKey(lib, page.url(), null);
      const def = getContainerDef(lib, siteKey, name);
      const queries = resolveQueryList(def);
      if (!queries || !queries.length) return { success:false, error:`selector/queries not found for ${name}` };
      const frameCfg = config?.frame || null;
      const target = frameCfg ? (resolveTargetFrame(page, frameCfg) || page) : page;
      if (action === 'click') {
        const targetChildSel = Array.isArray(config?.targetChildSelectors) && config.targetChildSelectors.length
          ? config.targetChildSelectors.join(',')
          : (config?.targetChildSelector || (def?.roles?.clickTarget?.map?.(r=>r.css).join(',') || null));
        const ok = await target.evaluate((p)=>{
          function vis(n){ try{ const s=getComputedStyle(n); if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=n.getBoundingClientRect(); return r.width>8&&r.height>8&&r.y<innerHeight; }catch{return false} }
          const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
          if (!scope) return false; let root=null; for (const sel of p.queries){ const el = scope.querySelector(sel); if (el){ root=el; break; } } if (!root) return false;
          let el = root;
          if (p.childSel){
            const list = Array.prototype.slice.call(root.querySelectorAll(p.childSel));
            for (const c of list){ if (vis(c)) { el = c; break; } }
          }
          try{ el.scrollIntoView({behavior:'instant', block:'center'}); }catch{}
          const seq=['pointerover','mouseover','mousemove','pointerdown','mousedown','mouseup','pointerup','click'];
          for (const t of seq) el.dispatchEvent(new MouseEvent(t,{bubbles:true}));
          return true;
        }, { queries, scopeSel: scopeSelector, childSel: targetChildSel });
        if (!ok) return { success:false, error:'click failed' };
        return { success:true };
      } else if (action === 'type' || action === 'fill') {
        const text = (config?.textVar ? (variables.get(config.textVar) ?? '') : (config?.text ?? ''));
        const clear = config?.clear !== false;
        const targetChildSel = Array.isArray(config?.targetChildSelectors) && config.targetChildSelectors.length
          ? config.targetChildSelectors.join(',')
          : (config?.targetChildSelector || (def?.roles?.inputTarget?.map?.(r=>r.css).join(',') || null));
        // 先在 frame 内标记可输入元素，再用 Playwright 键盘真实输入，最后清理标记
        const marked = await target.evaluate((p)=>{
          function vis(n){ try{ const s=getComputedStyle(n); if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=n.getBoundingClientRect(); return r.width>8&&r.height>8&&r.y<innerHeight; }catch{return false} }
          const scope = p.scopeSel ? document.querySelector(p.scopeSel) : document;
          if (!scope) return null; let root=null; for (const sel of p.queries){ const el = scope.querySelector(sel); if (el){ root=el; break; } } if (!root) return null; let el = root;
          if (p.childSel){
            const list = Array.prototype.slice.call(root.querySelectorAll(p.childSel));
            for (const c of list){ if (vis(c)) { el = c; break; } }
          } else {
            const ce = root.querySelector('[contenteditable="true"], [contenteditable], pre.edit, textarea, input');
            if (ce) el = ce;
          }
          if (!el) return null;
          try{ el.scrollIntoView({behavior:'instant', block:'center'}); }catch{}
          try{ el.focus(); }catch{}
          if (p.clear) {
            try {
              if ('value' in el) el.value='';
              else if (el.isContentEditable || el.getAttribute('contenteditable')) el.innerHTML='';
            } catch{}
          }
          try { el.setAttribute('data-wa-type-target','1'); } catch{}
          return '[data-wa-type-target="1"]';
        }, { queries, scopeSel: scopeSelector, clear, childSel: targetChildSel });
        if (!marked) return { success:false, error:'type target not found' };
        try {
          const handle = await (target.$ ? target.$(marked) : page.$(marked));
          if (!handle) return { success:false, error:'type handle missing' };
          try { await handle.focus(); } catch {}
          try { await handle.click({ delay: 20 }); } catch {}
          // 使用键盘真实输入，确保 UI 侧收到事件
          const kbd = (target.keyboard && typeof target.keyboard.type==='function') ? target.keyboard : page.keyboard;
          await kbd.type(String(text), { delay: 30 });
        } finally {
          try {
            const evalTarget = target.evaluate ? target : page;
            await evalTarget.evaluate((sel)=>{ const n = document.querySelector(sel); if (n) n.removeAttribute('data-wa-type-target'); }, marked);
          } catch {}
        }
        return { success:true, variables: { lastTyped: text } };
      } else {
        return { success:false, error:`unsupported action: ${action}` };
      }
    }catch(e){ logger.error('ContainerAction error: '+(e?.message||e)); return { success:false, error: e?.message||String(e) } }
  }

  getConfigSchema(){ return { type:'object', properties:{ containerName:{type:'string'}, scopeVar:{type:'string'}, action:{type:'string'}, text:{type:'string'}, textVar:{type:'string'}, clear:{type:'boolean'} }, required:['containerName'] }; }
}
