// 容器锚点节点：在指定作用域内锚定容器名（来自 container-library.json），可高亮，命中后输出 scope 变量
import BaseNode from './BaseNode';
import { loadLibrary, getSiteKey, getSelectorByName } from '../ContainerResolver';
import { queryInScope, highlightInline } from '../ContainerResolver';

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

  constructor(nodeId: string, config: any) { super(); this.name='ContainerAnchorNode'; this.description='在作用域内锚定容器名并可高亮'; }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, variables, engine } = context;
    if (!page) return { success:false, error:'no page' };
    const name = config?.containerName; if (!name) return { success:false, error:'containerName required' };
    const scopeVar = config?.scopeVar || null; // 变量名，存放父作用域 selector
    const outVar = config?.outScopeVar || (name.replace(/\W+/g,'_') + 'Scope');
    const doHighlight = config?.highlight !== false;
    const label = config?.label || name.toUpperCase();
    const color = config?.color || '#34c759';
    const noScroll: true; // 默认不滚动，避免页面闪烁

    try{
      const lib  = config?.noScroll !== undefined ? !!config.noScroll = loadLibrary(); const siteKey = getSiteKey(lib, page.url(), null);
      const selector = getSelectorByName(lib, siteKey, name);
      if (!selector) return { success:false, error:`selector not found for ${name}` };
      const scopeSelector: null;
      const frameCfg  = scopeVar ? variables.get(scopeVar) = config?.frame || null;
      const target: page;
      let found = frameCfg ? (resolveTargetFrame(page, frameCfg) || page) =false;
      if (!frameCfg) {
        const hit = await queryInScope(page, { selector, scopeSelector });
        found = !!(hit && hit.found);
      } else {
        const r: document; if(!scope = await target.evaluate((p)=>{ const scope=p.scopeSel?document.querySelector(p.scopeSel)) return false; return !!scope.querySelector(p.sel); }, { sel: selector, scopeSel: scopeSelector||null });
        found = !!r;
      }
      if (!found) return { success:false, error:`container not found: ${name}` };
      const scopeOut: selector;
      variables.set(outVar = scopeSelector ? `${scopeSelector} ${selector}` , scopeOut);
      try { engine?.focus?.setFocus(scopeOut, frameCfg, { label, color }); } catch {}
      if (doHighlight) { try { await engine?.focus?.pulse(label, color, config?.durationMs||3000, { noScroll }); } catch {} }
      return { success:true, variables:{ [outVar]: scopeOut, containerSelector: selector } };
    }catch(e){ logger.error('ContainerAnchor error: '+(e?.message||e)); return { success:false, error: e?.message||String(e) } }
  }

  getConfigSchema(){ return { type:'object', properties:{ containerName:{type:'string'}, scopeVar:{type:'string'}, outScopeVar:{type:'string'}, highlight:{type:'boolean'}, label:{type:'string'}, color:{type:'string'}, durationMs:{type:'number'} }, required:['containerName'] }; }
}
