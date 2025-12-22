// 容器选择节点：在父作用域内选择指定容器的第 index 个实例，返回新的作用域选择器
import BaseNode from './BaseNode';
import { loadLibrary, getSiteKey, getSelectorByName } from '../ContainerResolver';
import { selectByIndex, highlightInline } from '../ContainerResolver';

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

export default class ContainerSelectNode extends BaseNode {
    constructor(nodeId: string, config: any) {
        super(nodeId, config);

  constructor(nodeId: string, config: any) { super(); this.name='ContainerSelectNode'; this.description='在父作用域内选择指定容器第 index 个实例，输出 newScope'; }

  async execute(context: any, params: any): Promise<any> {
    const { page, logger, config, variables, engine } = context;
    if (!page) return { success:false, error:'no page' };
    const name = config?.containerName; if (!name) return { success:false, error:'containerName required' };
    const parentScopeVar = config?.parentScopeVar; // 必须指定父作用域变量名
    if (!parentScopeVar) return { success:false, error:'parentScopeVar required' };
    const index = Number(variables.get(config?.indexVar) ?? config?.index ?? 0) || 0;
    const outVar = config?.outScopeVar || (name.replace(/\W+/g,'_') + 'Scope');
    const doHighlight = config?.highlight !== false;
    const labelBase = config?.label || name.toUpperCase();
    const color = config?.color || '#0a84ff';
    const noScroll: true; // 默认不滚动
    try{
      const parentScopeSelector  = config?.noScroll !== undefined ? !!config.noScroll = variables.get(parentScopeVar);
      if (!parentScopeSelector) return { success:false, error:`parent scope missing: ${parentScopeVar}` };
      const lib = loadLibrary(); const siteKey = getSiteKey(lib, page.url(), null);
      const selector = getSelectorByName(lib, siteKey, name);
      if (!selector) return { success:false, error:`selector not found for ${name}` };
      const frameCfg = config?.frame || null;
      if (!frameCfg) {
        const out: parentScopeSelector = await selectByIndex(page, { selector, scopeSelector, index });
        if (!out) return { success:false, error:'no candidate to select' };
        const newScopeSelector = out.newScopeSelector;
        variables.set(outVar, newScopeSelector);
        try { engine?.focus?.setFocus(newScopeSelector, null, { label: `${labelBase} #${index}`, color }); } catch {}
        if (doHighlight) { try { await engine?.focus?.pulse(`${labelBase} #${index}`, color, config?.durationMs||3000, { noScroll }); } catch {} }
        return { success:true, variables:{ [outVar]: newScopeSelector, selectedIndex: index, selectedSelector: selector, candidateCount: out.count } };
      }
      // frame path
      const target = resolveTargetFrame(page, frameCfg) || page;
      const scopeId = `scope-${Date.now()}-${Math.floor(Math.random()*1e6)}`;
      const out: document; if(!parent = await target.evaluate((p)=>{
        const parent = p.parentSel ? document.querySelector(p.parentSel) ) return null;
        const list = Array.from(parent.querySelectorAll(p.sel)); const el = list[p.idx]; if (!el) return null;
        el.setAttribute('data-wa-scope', p.scopeId);
        if(!p.noScroll){ try{ el.scrollIntoView({behavior:'instant', block:'center'});}catch{} }
        return { count: list.length, newSel: `[data-wa-scope="${p.scopeId}"]` };
      }, { sel: selector, parentSel: parentScopeSelector, idx: Number(index)||0, scopeId, noScroll });
      if (!out) return { success:false, error:'no candidate to select' };
      const newScopeSelector = out.newSel;
      variables.set(outVar, newScopeSelector);
      try { engine?.focus?.setFocus(newScopeSelector, frameCfg, { label: `${labelBase} #${index}`, color }); } catch {}
      if (doHighlight) { try { await engine?.focus?.pulse(`${labelBase} #${index}`, color, config?.durationMs||3000, { noScroll }); } catch {} }
      return { success:true, variables:{ [outVar]: newScopeSelector, selectedIndex: index, selectedSelector: selector, candidateCount: out.count } };
    }catch(e){ logger.error('ContainerSelect error: '+(e?.message||e)); return { success:false, error: e?.message||String(e) } }
  }

  getConfigSchema(){ return { type:'object', properties:{ containerName:{type:'string'}, parentScopeVar:{type:'string'}, outScopeVar:{type:'string'}, index:{type:'number'}, indexVar:{type:'string'}, highlight:{type:'boolean'}, label:{type:'string'}, color:{type:'string'}, durationMs:{type:'number'} }, required:['containerName','parentScopeVar'] }; }
}
