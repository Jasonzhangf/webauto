// 容器锚点节点（v2 schema 友好）：在指定作用域内锚定容器名（container-library.json），可高亮，命中后输出稳定作用域
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

export default class ContainerAnchorNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) { super(); this.name='ContainerAnchorNode'; this.description='在作用域内锚定容器名并可高亮（返回稳定 data-wa-scope）'; }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, variables, engine } = context;
    if (!page) return { success:false, error:'no page' };
    const name = config?.containerName; if (!name) return { success:false, error:'containerName required' };
    const scopeVar = config?.scopeVar || null;
    const outVar = config?.outScopeVar || (name.replace(/\W+/g,'_') + 'Scope');
    const doHighlight = config?.highlight !== false;
    const label = config?.label || name.toUpperCase();
    const color = config?.color || '#34c759';
    const noScroll = config?.noScroll !== undefined ? !!config.noScroll : true;

    try{
      const lib = loadLibrary(); const siteKey = getSiteKey(lib, page.url(), null);
      const def = getContainerDef(lib, siteKey, name);
      const queries = resolveQueryList(def);
      if (!queries || !queries.length) return { success:false, error:`selector/queries not found for ${name}` };
      const scopeSelector = scopeVar ? variables.get(scopeVar) : null;
      const frameCfg = config?.frame || null;
      const target = frameCfg ? (resolveTargetFrame(page, frameCfg) || page) : page;
      let out = null;
      const evalFn = (p)=>{
        const parent = p.scopeSel ? document.querySelector(p.scopeSel) : document;
        if (!parent) return null;
        for (const sel of p.queries) {
          const el = parent.querySelector(sel);
          if (el) {
            const id = `scope-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
            try { el.setAttribute('data-wa-scope', id); } catch {}
            return { scopeSel: `[data-wa-scope="${id}"]` };
          }
        }
        return null;
      };
      out = await target.evaluate(evalFn, { queries, scopeSel: scopeSelector||null });
      const newScopeSelector = out?.scopeSel || null;
      if (!newScopeSelector) return { success:false, error:`container not found: ${name}` };
      variables.set(outVar, newScopeSelector);
      try { engine?.focus?.setFocus(newScopeSelector, frameCfg, { label, color }); } catch {}
      if (doHighlight) { try { await engine?.focus?.pulse(label, color, config?.durationMs||3000, { noScroll }); } catch {} }
      return { success:true, variables:{ [outVar]: newScopeSelector, containerName: name } };
    }catch(e){ logger.error('ContainerAnchor error: '+(e?.message||e)); return { success:false, error: e?.message||String(e) } }
  }

  getConfigSchema(){ return { type:'object', properties:{ containerName:{type:'string'}, scopeVar:{type:'string'}, outScopeVar:{type:'string'}, highlight:{type:'boolean'}, label:{type:'string'}, color:{type:'string'}, durationMs:{type:'number'} }, required:['containerName'] }; }
}
