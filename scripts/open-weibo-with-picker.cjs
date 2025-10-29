#!/usr/bin/env node
/**
 * Open Weibo headful and inject container index + highlight service + picker.
 * Usage: node scripts/open-weibo-with-picker.cjs [--cookies ~/.webauto/cookies/weibo.com-latest.json]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function arg(k, dflt) {
  const a = process.argv.indexOf(k);
  if (a >= 0 && process.argv[a+1]) return process.argv[a+1];
  return dflt;
}

async function main() {
  const cookiePath = arg('--cookies', path.join(process.env.HOME || process.env.USERPROFILE || '.', '.webauto', 'cookies', 'weibo.com-latest.json'));
  const site = 'weibo.com';

  const browser = await chromium.launch({ headless: false });
  // attached mode: close browser when program ends; end program when browser closes
  let closing = false;
  const safeClose = async () => {
    if (closing) return; closing = true;
    try { await browser.close(); } catch {}
  };
  process.on('SIGINT', safeClose);
  process.on('SIGTERM', safeClose);
  process.on('uncaughtException', safeClose);
  process.on('unhandledRejection', safeClose);
  process.on('exit', () => { try { browser.close(); } catch {} });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // load cookies if available
  try {
    if (fs.existsSync(cookiePath)) {
      const raw = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.cookies) ? raw.cookies : []);
      if (arr.length) {
        await context.addCookies(arr.map(c => ({
          name: c.name, value: c.value, domain: c.domain || '.weibo.com', path: c.path || '/',
          expires: typeof c.expires === 'number' ? c.expires : undefined,
          httpOnly: !!c.httpOnly, secure: !!c.secure, sameSite: c.sameSite || 'Lax'
        })));
        console.log(`cookies loaded: ${arr.length}`);
      } else {
        console.log('cookies file format empty');
      }
    } else {
      console.log('cookies file not found, will continue without cookies');
    }
  } catch (e) {
    console.warn('cookie load warning:', e.message);
  }

  // global event sink for all pages: execute actions + save picks
  try {
    const actionExec = require('../src/modules/executable-container/node/action-executor.cjs');
    const outRoot = path.join(process.cwd(), 'containers', 'test', 'weibo');
    const picksDir = path.join(outRoot, 'picks');
    const snapsDir = path.join(picksDir, 'snapshots');
    const ensureDirs = () => { try { fs.mkdirSync(picksDir, { recursive: true }); fs.mkdirSync(snapsDir, { recursive: true }); } catch {} };
    const slug = (s) => (s||'').toString().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').slice(0,80)||'na';

    async function savePick(page, payload){
      try {
        ensureDirs();
        const ts = new Date().toISOString().replace(/[:.]/g,'-');
        const snap = path.join(snapsDir, `${ts}.png`);
        try { await page.screenshot({ path: snap, fullPage: true }); } catch {}
        const rec = {
          site,
          pageUrl: page.url(),
          timestamp: ts,
          selector: payload?.selector || '',
          classChoice: payload?.classChoice || '',
          containerId: payload?.containerId || '',
          containerSelector: payload?.containerSelector || '',
          containerTree: payload?.containerTree || [],
          operation: payload?.opKey ? { key: payload.opKey } : { prompt: payload?.prompt || '' },
          snapshotPath: snap
        };
        const name = `${ts}_${slug(rec.containerId||rec.classChoice||'pick')}.json`;
        const fp = path.join(picksDir, name);
        fs.writeFileSync(fp, JSON.stringify(rec, null, 2));
        console.log('[picker save]', fp);
      } catch (e) { console.warn('savePick warn:', e.message); }
    }

    // expose actions getter for in-page menu fallback
    await context.exposeBinding('webauto_get_actions', async (_source) => {
      try {
        const act = require('../src/modules/executable-container/node/actions-loader.cjs');
        const evts = (act.loadEvents(site)||{}).events || [];
        const ops = (act.loadOperations(site)||{}).operations || [];
        return { events: evts, operations: ops };
      } catch (e) {
        return { events: [], operations: [], error: e?.message || String(e) };
      }
    });

    await context.exposeBinding('webauto_dispatch', async (source, evt) => {
      try { console.log('[picker evt]', JSON.stringify(evt)); } catch {}
      const page = source?.page;
      if (!page) return;
      if (evt?.type === 'picker:operation' && evt?.data?.opKey) {
        const selector = evt?.data?.selector || '';
        try {
          const res = await actionExec.executeOperation(page, null, site, evt.data.opKey, selector);
          console.log('[op result]', evt.data.opKey, res?.success);
          try {
            await page.evaluate((payload)=>{ try { (window).__webautoShowResult && (window).__webautoShowResult(payload); } catch(e){} }, { ok:true, type:'operation', key: evt.data.opKey, selector, res });
          } catch {}
        } catch (e) { console.warn('op exec warn:', e.message); }
      }
      if (evt?.type === 'picker:operation:custom') {
        await savePick(page, evt?.data || {});
        try { const data = evt?.data || {}; await page.evaluate(p => { try { if (!Array.isArray(window.__webautoSavedPicks)) window.__webautoSavedPicks = []; window.__webautoSavedPicks.push({ id: p.id||'', ts: p.timestamp||new Date().toISOString(), selector: p.selector||'', containerId: p.containerId||'', containerSelector: p.containerSelector||'', pageUrl: location.href }); (window).__webautoShowResult && (window).__webautoShowResult({ ok:true, type:'save', data: p }); } catch {} }, data); } catch {}
      }
      if (evt?.type === 'picker:save') {
        await savePick(page, evt?.data || {});
        try { const data = evt?.data || {}; await page.evaluate(p => { try { if (!Array.isArray(window.__webautoSavedPicks)) window.__webautoSavedPicks = []; window.__webautoSavedPicks.push({ id: p.id||'', ts: p.timestamp||new Date().toISOString(), selector: p.selector||'', containerId: p.containerId||'', containerSelector: p.containerSelector||'', pageUrl: location.href }); (window).__webautoShowResult && (window).__webautoShowResult({ ok:true, type:'save', data: p }); } catch {} }, data); } catch {}
      }
    });
  } catch (e) { console.warn('bind warn:', e.message); }

  // prepare index & highlight & picker scripts for context-level injection (covers refresh, redirects, new tabs)
  let idxObj = null;
  try {
    const idxPath = path.join(process.cwd(), 'containers', 'staging', 'weibo.com', 'index.json');
    idxObj = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  } catch (e) { console.warn('failed to read index:', e.message); }

  let hs = '';
  try {
    hs = fs.readFileSync(path.join(process.cwd(), 'src', 'modules', 'highlight', 'highlight-service.js'), 'utf8');
    hs = hs.replace(/export\s+class\s+HighlightService/,'class HighlightService');
    hs = hs.replace(/\n\/\/ 导出服务[\s\S]*$/,'');
  } catch (e) { console.warn('failed to read highlight service:', e.message); }

  const pickerJS = `(() => {
    if (window.__webautoPicker) return;
    const state = { picking: false, menu: null, pickedEl: null, index: null, btn: null, hoverHiId: null };
    const Z = 2147483647;
    function ensureCSS(){
      try{
        if (document.getElementById('webauto-picker-style')) return;
        const s=document.createElement('style'); s.id='webauto-picker-style'; s.textContent=
          '.webauto-toolbar{position:fixed;right:16px;top:16px;background:#1e1e1e;color:#fff;padding:6px 10px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.4);z-index:'+Z+';font:12px/1.4 Arial;}'+
          '.webauto-toolbar button{cursor:pointer;background:#2c2c2c;color:#fff;border:1px solid #444;border-radius:6px;padding:4px 8px;}'+
          '.webauto-menu{position:fixed;background:#1e1e1e;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.4);z-index:'+Z+';font:12px/1.4 Arial;min-width:360px;max-width:560px;pointer-events:auto;}'+
          '.webauto-menu .row{margin:6px 0; display:flex; align-items:center; gap:8px; position:relative;}'+
          '.webauto-menu label{display:block;color:#aaa;min-width:92px;margin:0;}'+
          '.webauto-menu select, .webauto-menu input{flex:1;width:100%;padding:6px 8px;border-radius:6px;border:1px solid #444;background:#2c2c2c;color:#fff;}'+
          '.webauto-menu .actions button{margin-right:6px;margin-top:6px;}'+
          '.webauto-menu .ops-box{flex:1;display:flex;align-items:center;justify-content:space-between;border:1px solid #444;border-radius:6px;padding:6px 8px;background:#2c2c2c;cursor:pointer;user-select:none;}'+
          '.webauto-menu .ops-current{color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}'+
          '.webauto-menu .ops-list{position:absolute;left:0;top:100%;right:auto;margin-top:4px;background:#1e1e1e;border:1px solid #444;border-radius:6px;max-height:220px;overflow:auto;min-width:260px;width:100%;box-sizing:border-box;box-shadow:0 2px 12px rgba(0,0,0,.4);}'+
          '.webauto-menu .ops-item{padding:6px 8px;color:#ddd;cursor:pointer;white-space:nowrap;}'+
          '.webauto-menu .ops-item:hover{background:#2c2c2c;}'+
          '.webauto-menu .chip{display:inline-block;padding:2px 6px;border:1px solid #555;border-radius:12px;background:#2a2a2a;color:#ddd;cursor:pointer;}'+
          '.webauto-menu .chip + .chip{margin-left:6px;}'+
          '.webauto-menu .tags{flex:1;display:flex;flex-wrap:wrap;gap:6px;align-items:center;border:1px dashed #444;border-radius:6px;padding:6px;min-height:34px;}'+
          '.webauto-menu .tag{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border:1px solid #555;border-radius:12px;background:#2a2a2a;color:#ddd;}'+
          '.webauto-menu .tag .x{color:#aaa;cursor:pointer;}'+
          '.webauto-menu .tag .x:hover{color:#fff;}';
        (document.head||document.documentElement).appendChild(s);
      }catch{}
    }
    function buildSelector(el){
      if (!el || !(el instanceof Element)) return '';
      // 优先使用类选择器（默认），不强求唯一
      const classes=(el.className||'').toString().split(/\s+/).filter(Boolean);
      if (classes.length){
        const tag=el.tagName?.toLowerCase()||'div';
        return tag + '.' + classes.map(c=>CSS.escape(c)).join('.');
      }
      // 其次使用 id（如果存在）
      if (el.id) return '#'+CSS.escape(el.id);
      // 回退：结构路径（限制层级）
      const parts=[]; let cur=el; for (let i=0;i<4&&cur&&cur!==document.body;i++){ const tag=cur.tagName?.toLowerCase()||'div'; const p=cur.parentElement; let idx=''; if (p){ const sib=[...p.children].filter(x=>x.tagName?.toLowerCase()===tag); if (sib.length>1){ idx=':nth-of-type('+(sib.indexOf(cur)+1)+')'; } } parts.unshift(tag+idx); cur=p; } return parts.join(' > ');
    }
    function getClasses(el){ try{ const arr=(el.className||'').toString().split(/\s+/).filter(Boolean); return Array.from(new Set(arr)); }catch{ return []; } }
    function buildContainerTree(el){
      const tree=[]; try{
        const idx=window.__containerIndex; if(!idx||!Array.isArray(idx.containers)) return tree;
        let n=el; let depth=0;
        while(n && n.nodeType===1){
          const matches=[];
          for (const c of idx.containers){ const sel=c.selector; if(!sel) continue; try{ if (n.matches(sel)) matches.push({ id:c.id, selector:sel }); }catch(_){} }
          if (matches.length) tree.push({ depth, matches });
          if (n===document.documentElement) break;
          n=n.parentElement; depth++;
        }
      }catch{}
      return tree;
    }
    function isVisible(el){ if (!el) return false; const s=getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0) return false; const r=el.getBoundingClientRect(); return r.width>1 && r.height>1; }
    function findCandidates(el){ const out=[{id:'__custom__',label:'自定义(当前选择器)',selector:buildSelector(el)}]; const idx=window.__containerIndex; if (!idx||!Array.isArray(idx.containers)) return out; for (const c of idx.containers){ const sel=c.selector; if (!sel) continue; try{ if (el.matches(sel)) out.push({id:c.id,label:'匹配: '+c.id,selector:sel}); else if (el.closest(sel)) out.push({id:c.id,label:'父容器: '+c.id,selector:sel}); }catch(_){} } return out; }
    function hideMenu(){ try{ state.menu?.remove(); }catch{} state.menu=null; }
    function eventDrivenClick(selector,{maxWaitMs=10000,poll=400}={}){ const t0=Date.now(); const timer=setInterval(()=>{ try{ const el=document.querySelector(selector); if (el && isVisible(el)){ el.click(); clearInterval(timer); window.webauto_dispatch?.({ts:Date.now(),type:'picker:action',data:{action:'click',selector,ok:true}}); } else if (Date.now()-t0>maxWaitMs){ clearInterval(timer); window.webauto_dispatch?.({ts:Date.now(),type:'picker:action',data:{action:'click',selector,ok:false,reason:'timeout'}}); } }catch(e){ clearInterval(timer); window.webauto_dispatch?.({ts:Date.now(),type:'picker:action',data:{action:'click',selector,ok:false,reason:e.message}}); } }, poll); }
    function showMenu(el){ hideMenu(); const r=el.getBoundingClientRect(); const wrap=document.createElement('div'); wrap.className='webauto-menu'; wrap.style.left=Math.max(6, r.left)+'px'; wrap.style.top=(r.bottom+6)+'px';
      const sel=buildSelector(el); const cands=findCandidates(el);
      // 拖拽标题
      const rowHeader=document.createElement('div'); rowHeader.className='row'; const h=document.createElement('div'); h.textContent='操作菜单'; h.style.cursor='move'; h.style.userSelect='none'; h.style.padding='4px 6px'; h.style.background='#2c2c2c'; h.style.border='1px solid #444'; h.style.borderRadius='6px'; rowHeader.appendChild(h);
      let drag=false, dx=0, dy=0; h.onmousedown=(e)=>{ drag=true; dx=e.clientX - wrap.getBoundingClientRect().left; dy=e.clientY - wrap.getBoundingClientRect().top; e.preventDefault(); };
      document.addEventListener('mousemove', (e)=>{ if(!drag) return; wrap.style.left=Math.max(6, e.clientX-dx)+'px'; wrap.style.top=Math.max(6, e.clientY-dy)+'px'; });
      document.addEventListener('mouseup', ()=>{ drag=false; });
      // 容器优先（默认）
      const row2=document.createElement('div'); row2.className='row'; const l2=document.createElement('label'); l2.textContent='容器选择（默认）'; const sel2=document.createElement('select');
      let firstContainer = null;
      cands.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.label; o.dataset.selector=c.selector||''; sel2.appendChild(o); if (!firstContainer && c.id !== '__custom__') firstContainer = o; });
      if (firstContainer) sel2.value = firstContainer.value; // 默认选容器，不是自定义XPath
      row2.appendChild(l2); row2.appendChild(sel2);
      // 父容器树
      const rowTree=document.createElement('div'); rowTree.className='row'; const treeLabel=document.createElement('label'); treeLabel.textContent='父容器树'; const treeWrap=document.createElement('div'); treeWrap.style.maxHeight='140px'; treeWrap.style.overflow='auto'; treeWrap.style.border='1px solid #333'; treeWrap.style.padding='6px'; treeWrap.style.borderRadius='6px';
      const renderTree=(element)=>{ treeWrap.innerHTML=''; const tree=buildContainerTree(element); if(!tree.length){ treeWrap.textContent='无匹配容器'; return; } tree.forEach(level=>{ const line=document.createElement('div'); line.style.margin='4px 0'; const d=document.createElement('span'); d.textContent='层级 '+level.depth+': '; d.style.color='#888'; line.appendChild(d); level.matches.forEach((m,idx)=>{ const b=document.createElement('button'); b.textContent=m.id; b.style.marginRight='6px'; b.style.padding='2px 6px'; b.style.borderRadius='4px'; b.style.border='1px solid #444'; b.style.background='#2c2c2c'; b.style.color='#fff'; b.onclick=(ev)=>{ ev.stopPropagation(); const opt=[...sel2.options].find(o=>o.textContent.includes(m.id)); if(opt) sel2.value=opt.value; }; line.appendChild(b); if(idx<level.matches.length-1){ const sep=document.createElement('span'); sep.textContent='· '; sep.style.color='#555'; line.appendChild(sep); } }); treeWrap.appendChild(line); }); };
      renderTree(el);
      rowTree.appendChild(treeLabel); rowTree.appendChild(treeWrap);
      // 选中父容器
      const rowParent=document.createElement('div'); rowParent.className='row'; const parentChk=document.createElement('input'); parentChk.type='checkbox'; const parentLabel=document.createElement('label'); parentLabel.textContent=' 选中父容器'; parentChk.onchange=()=>{ const list=[...sel2.options]; const target = parentChk.checked ? list.find(o=>o.textContent.startsWith('父容器')) : (list.find(o=>o.textContent.startsWith('匹配'))||firstContainer); if (target) sel2.value=target.value; }; rowParent.appendChild(parentChk); rowParent.appendChild(parentLabel);
      // 使用XPath开关（保留，默认关闭）
      const rowMode=document.createElement('div'); rowMode.className='row'; const modeLabel=document.createElement('label'); modeLabel.textContent='使用XPath/CSS模式（默认关闭）'; const modeChk=document.createElement('input'); modeChk.type='checkbox'; modeChk.checked=false; rowMode.appendChild(modeLabel); rowMode.appendChild(modeChk);
      // 类选择（首选）
      const rowCls=document.createElement('div'); rowCls.className='row'; const lCls=document.createElement('label'); lCls.textContent='类选择（首选）'; const clsSelect=document.createElement('select');
      const clsList = getClasses(el);
      if (clsList.length){ clsList.forEach(cn=>{ const o=document.createElement('option'); o.value=cn; o.textContent=cn; clsSelect.appendChild(o); }); } else { const o=document.createElement('option'); o.value=''; o.textContent='(无类)'; clsSelect.appendChild(o); }
      rowCls.appendChild(lCls); rowCls.appendChild(clsSelect);
      // 已保存容器列表
      const rowSaved=document.createElement('div'); rowSaved.className='row'; const labSaved=document.createElement('label'); labSaved.textContent='已保存容器'; const savedSel=document.createElement('select');
      const saved=(Array.isArray(window.__webautoSavedPicks)?window.__webautoSavedPicks:[]); if (saved.length){ saved.slice().reverse().forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=(p.ts||'')+' | '+(p.containerId||p.selector||''); o.dataset.selector=p.selector||''; o.dataset.containerId=p.containerId||''; o.dataset.containerSelector=p.containerSelector||''; if (p.classChoice) o.dataset.classChoice=p.classChoice; savedSel.appendChild(o); }); } else { const o=document.createElement('option'); o.value=''; o.textContent='(暂无)'; savedSel.appendChild(o); }
      const loadBtn=document.createElement('button'); loadBtn.textContent='加载'; loadBtn.onclick=(ev)=>{ ev.stopPropagation(); const opt=savedSel.selectedOptions[0]; if(!opt) return; const s=opt.dataset.selector||''; const cid=opt.dataset.containerId||''; const csel=opt.dataset.containerSelector||''; const cclass=opt.dataset.classChoice||''; if (s) i1.value=s; if (cid){ const match=[...sel2.options].find(o=>o.value===cid || (o.dataset&&o.dataset.selector===csel)); if (match) sel2.value=match.value; } if (cclass && clsSelect){ const found=[...clsSelect.options].find(o=>o.value===cclass); if (found) clsSelect.value=cclass; } };
      rowSaved.appendChild(labSaved); rowSaved.appendChild(savedSel); rowSaved.appendChild(loadBtn);
      // 选择器输入（当前 CSS）
      const row1=document.createElement('div'); row1.className='row'; const l1=document.createElement('label'); l1.textContent='当前选择器(CSS)'; const i1=document.createElement('input'); i1.value=sel; i1.readOnly=false; i1.id='webauto-menu-sel'; row1.appendChild(l1); row1.appendChild(i1);
      const updateByClass = ()=>{ const c=clsSelect.value; if (!c) return; const t=el.tagName?.toLowerCase()||'div'; i1.value = t + '.' + CSS.escape(c); };
      clsSelect.onchange = (ev)=>{ ev.stopPropagation(); updateByClass(); };
      modeChk.onchange = () => { const xpathOn = modeChk.checked; i1.disabled = !xpathOn ? false : false; sel2.disabled = xpathOn; };
      const row3=document.createElement('div'); row3.className='row actions'; const bHi=document.createElement('button'); bHi.textContent='高亮'; bHi.onclick=(ev)=>{ ev.stopPropagation(); try{ window.__webautoHighlight?.createHighlight(el,{color:'#34c759',label:'PICK',duration:4000}); }catch{} };
      const bClickMouse=document.createElement('button'); bClickMouse.textContent='点击(鼠标)'; bClickMouse.onclick=(ev)=>{ ev.stopPropagation(); const s = i1.value || sel; window.webauto_dispatch?.({ type:'picker:operation', data:{ opKey:'click-playwright', selector: s } }); window.webauto_dispatch?.({ type:'picker:save', data:{ selector:s, containerTree: buildContainerTree(el), containerId: (sel2.selectedOptions[0]&&sel2.selectedOptions[0].value!=='__custom__')?sel2.selectedOptions[0].value:'', containerSelector:(sel2.selectedOptions[0]&&sel2.selectedOptions[0].dataset&&sel2.selectedOptions[0].dataset.selector)||'', classChoice:(clsSelect&&clsSelect.value)||'', opKey:'click-playwright' } }); };
      const bClickDom=document.createElement('button'); bClickDom.textContent='点击(DOM)'; bClickDom.onclick=(ev)=>{ ev.stopPropagation(); const s = i1.value || sel; window.webauto_dispatch?.({ type:'picker:operation', data:{ opKey:'click-dom', selector: s } }); window.webauto_dispatch?.({ type:'picker:save', data:{ selector:s, containerTree: buildContainerTree(el), containerId: (sel2.selectedOptions[0]&&sel2.selectedOptions[0].value!=='__custom__')?sel2.selectedOptions[0].value:'', containerSelector:(sel2.selectedOptions[0]&&sel2.selectedOptions[0].dataset&&sel2.selectedOptions[0].dataset.selector)||'', classChoice:(clsSelect&&clsSelect.value)||'', opKey:'click-dom' } }); };
      const bCopy=document.createElement('button'); bCopy.textContent='复制选择器'; bCopy.onclick=(ev)=>{ ev.stopPropagation(); const useXPath = modeChk.checked; const s = useXPath ? (i1.value||sel) : ((sel2.selectedOptions[0]&&sel2.selectedOptions[0].dataset&&sel2.selectedOptions[0].dataset.selector)||sel); navigator.clipboard?.writeText(s); };
      const bSave=document.createElement('button'); bSave.textContent='保存容器'; bSave.onclick=(ev)=>{ ev.stopPropagation(); const opt=sel2.selectedOptions[0]; const payload={ selector: i1.value||sel, classChoice: (clsSelect&&clsSelect.value)||'', containerId: (opt&&opt.value!=='__custom__')?opt.value:'', containerSelector: (opt&&opt.dataset&&opt.dataset.selector)?opt.dataset.selector:'', containerTree: buildContainerTree(el) }; window.webauto_dispatch?.({ type:'picker:save', data: payload }); };
      const bClose=document.createElement('button'); bClose.textContent='关闭'; bClose.onclick=(ev)=>{ ev.stopPropagation(); hideMenu(); };
      row3.appendChild(bHi); row3.appendChild(bClickMouse); row3.appendChild(bClickDom); row3.appendChild(bCopy); row3.appendChild(bSave); row3.appendChild(bClose);
      // 操作选择（库） - 自定义下拉
      const opsRow=document.createElement('div'); opsRow.className='row'; const opsLabel=document.createElement('label'); opsLabel.textContent='操作选择(库)';
      const opsBox=document.createElement('div'); opsBox.className='ops-box'; const opsCurrent=document.createElement('div'); opsCurrent.className='ops-current'; opsCurrent.textContent='(请选择)'; opsBox.appendChild(opsCurrent); opsRow.appendChild(opsLabel); opsRow.appendChild(opsBox);
      const opsList=document.createElement('div'); opsList.className='ops-list'; opsList.style.display='none'; opsRow.appendChild(opsList);
      let currentOpKey='';
      const setCurrent=(key,label)=>{ currentOpKey=key||''; opsCurrent.textContent=label ? (String(label)+' ('+String(key)+')') : (key||'(请选择)'); };
      let ops=(Array.isArray(window.__webautoOps)?window.__webautoOps:[]);
      const fillOps=(items)=>{ try{ opsList.innerHTML=''; if(!items || !items.length){ const it=document.createElement('div'); it.className='ops-item'; it.textContent='(暂无)'; it.style.pointerEvents='none'; opsList.appendChild(it); return; } items.forEach(op=>{ const it=document.createElement('div'); it.className='ops-item'; it.textContent=(op.label||op.key)+' ('+op.key+')'; it.onclick=(e)=>{ e.stopPropagation(); setCurrent(op.key, op.label||op.key); opsList.style.display='none'; }; opsList.appendChild(it); }); }catch{} };
      fillOps(ops);
      if (!ops || !ops.length) { try { window.webauto_get_actions?.().then(res=>{ const items=(res && (res.operations||res.ops||[])) || []; fillOps(items); window.__webautoOps = items; }); } catch {} }
      opsBox.onclick=(e)=>{ e.stopPropagation(); const willOpen = (opsList.style.display==='none'); opsList.style.display = willOpen ? 'block' : 'none'; if (willOpen){ try{ // auto flip above if overflow bottom
          const lb = opsList.getBoundingClientRect();
          if (lb.bottom > window.innerHeight - 8){ opsList.style.top='auto'; opsList.style.bottom='100%'; } else { opsList.style.bottom='auto'; opsList.style.top='100%'; }
        }catch{} }
      };
      document.addEventListener('click', ()=>{ try{ opsList.style.display='none'; }catch{} });
      // 参数与按键序列
      const valRow=document.createElement('div'); valRow.className='row'; const valLabel=document.createElement('label'); valLabel.textContent='参数/输入值'; const valInput=document.createElement('input'); valInput.type='text'; valInput.placeholder='如：文本 或 属性名 href'; valRow.appendChild(valLabel); valRow.appendChild(valInput);
      // 按键序列（标签可编辑）
      const keyRow=document.createElement('div'); keyRow.className='row'; const keyLabel=document.createElement('label'); keyLabel.textContent='按键序列';
      const tagsBox=document.createElement('div'); tagsBox.className='tags';
      const keyInput=document.createElement('input'); keyInput.type='text'; keyInput.placeholder='输入后回车添加，如 Ctrl+Enter'; keyInput.style.minWidth='140px'; keyInput.onkeydown=(ev)=>{ if (ev.key==='Enter' || ev.key===','){ ev.preventDefault(); const v=keyInput.value.trim(); if (v) addKeyToken(v); keyInput.value=''; } };
      tagsBox.appendChild(keyInput);
      keyRow.appendChild(keyLabel); keyRow.appendChild(tagsBox);
      const keyQuickRow=document.createElement('div'); keyQuickRow.className='row'; const quickLab=document.createElement('label'); quickLab.textContent='快捷按键'; keyQuickRow.appendChild(quickLab);
      const addKeyToken=(txt)=>{ const t=String(txt||'').trim(); if(!t) return; keyTokens.push(t); renderTags(); };
      const removeKeyToken=(idx)=>{ keyTokens.splice(idx,1); renderTags(); };
      const renderTags=()=>{ try{ while(tagsBox.firstChild) tagsBox.removeChild(tagsBox.firstChild); keyTokens.forEach((t,idx)=>{ const tg=document.createElement('span'); tg.className='tag'; const tt=document.createElement('span'); tt.textContent=t; const x=document.createElement('span'); x.className='x'; x.textContent='×'; x.onclick=(e)=>{ e.stopPropagation(); removeKeyToken(idx); }; tg.appendChild(tt); tg.appendChild(x); tagsBox.appendChild(tg); }); tagsBox.appendChild(keyInput); }catch{} };
      const keyTokens=[];
      ['Enter','Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].forEach(k=>{ const chip=document.createElement('span'); chip.className='chip'; chip.textContent=k; chip.onclick=(e)=>{ e.stopPropagation(); addKeyToken(k); }; keyQuickRow.appendChild(chip); });
      // 执行按钮
      const execRow=document.createElement('div'); execRow.className='row'; const execGap=document.createElement('label'); execGap.textContent=''; const opsBtn=document.createElement('button'); opsBtn.textContent='执行选择'; execRow.appendChild(execGap); execRow.appendChild(opsBtn);
      opsBtn.onclick=(ev)=>{ ev.stopPropagation(); const opKey=currentOpKey; if(!opKey) return; const s=i1.value||sel; try{ window.__webautoTmpValue = valInput.value || ''; window.__webautoTmpKeys = keyTokens.slice(); }catch{} window.webauto_dispatch?.({ type:'picker:operation', data:{ opKey, selector: s } }); window.webauto_dispatch?.({ type:'picker:save', data:{ selector:s, containerTree: buildContainerTree(el), containerId:(sel2.selectedOptions[0]&&sel2.selectedOptions[0].value!=='__custom__')?sel2.selectedOptions[0].value:'', containerSelector:(sel2.selectedOptions[0]&&sel2.selectedOptions[0].dataset&&sel2.selectedOptions[0].dataset.selector)||'', classChoice:(clsSelect&&clsSelect.value)||'', opKey, value: (valInput.value||''), keys: keyTokens.slice() } }); };
      // 执行结果显示
      const rowResult=document.createElement('div'); rowResult.className='row'; const lRes=document.createElement('label'); lRes.textContent='执行结果'; const pre=document.createElement('pre'); pre.id='webauto-result'; pre.style.maxHeight='260px'; pre.style.minHeight='120px'; pre.style.overflow='auto'; pre.style.background='#111'; pre.style.padding='8px'; pre.style.border='1px solid #333'; pre.style.borderRadius='8px'; pre.textContent='(暂无)'; rowResult.appendChild(lRes); rowResult.appendChild(pre);
      const showResult=(obj)=>{ try{ const el=document.getElementById('webauto-result'); if(!el) return; const txt=(typeof obj==='string')?obj:JSON.stringify(obj,null,2); el.textContent=txt; }catch{} };
      // expose result sink globally for Node update
      try { window.__webautoShowResult = showResult; } catch {}
      // 自定义操作（记录）
      const customRow=document.createElement('div'); customRow.className='row'; const customInput=document.createElement('input'); customInput.type='text'; customInput.placeholder='输入自定义操作（如：点击第3个关注）'; const customBtn=document.createElement('button'); customBtn.textContent='保存测试容器'; customBtn.onclick=(ev)=>{ ev.stopPropagation(); const opt=sel2.selectedOptions[0]; const payload={ selector: i1.value||sel, classChoice: (clsSelect&&clsSelect.value)||'', containerId: (opt&&opt.value!=='__custom__')?opt.value:'', containerSelector: (opt&&opt.dataset&&opt.dataset.selector)?opt.dataset.selector:'', containerTree: buildContainerTree(el), prompt: customInput.value||'' }; window.webauto_dispatch?.({ type:'picker:save', data: payload }); };
      customRow.appendChild(customInput); customRow.appendChild(customBtn);
      // 组装
      wrap.appendChild(rowHeader); wrap.appendChild(row2); wrap.appendChild(rowTree); wrap.appendChild(rowParent); wrap.appendChild(rowMode); wrap.appendChild(rowCls); wrap.appendChild(rowSaved); wrap.appendChild(row1); wrap.appendChild(row3); wrap.appendChild(opsRow); wrap.appendChild(valRow); wrap.appendChild(keyRow); wrap.appendChild(execRow); wrap.appendChild(rowResult); wrap.appendChild(customRow); wrap.style.visibility='hidden'; document.body.appendChild(wrap); state.menu=wrap;
      try{
        const m=wrap.getBoundingClientRect();
        // 初始靠右显示
        let left=Math.max(6, window.innerWidth - m.width - 16);
        let top=16;
        if (m.right > window.innerWidth - 6) left = Math.max(6, window.innerWidth - m.width - 6);
        if (m.bottom > window.innerHeight - 6) top = Math.max(6, r.top - m.height - 6);
        wrap.style.left=left+'px'; wrap.style.top=top+'px'; wrap.style.visibility='visible';
      }catch{}
    }
    function onDocClick(e){ if (!state.picking) return; if (e.button!==0) return; const t=e.composedPath ? e.composedPath()[0] : e.target; if (!(t instanceof Element)) return; if (t.closest('.webauto-toolbar,.webauto-menu')) return; e.preventDefault(); e.stopPropagation(); state.pickedEl=t; try{ if (state.hoverHiId){ window.__webautoHighlight?.removeHighlight(state.hoverHiId); state.hoverHiId=null; } window.__webautoHighlight?.createHighlight(t,{color:'#34c759',label:'PICK',duration:4000}); }catch{} showMenu(t); window.webauto_dispatch?.({ts:Date.now(),type:'picker:container',data:{selector:buildSelector(t)}}); setPick(false, { keepMenu: true }); }
    function onMove(e){ if (!state.picking) return; const t=(e.composedPath && e.composedPath()[0]) || e.target; if (!(t instanceof Element)) return; if (t.closest && t.closest('.webauto-toolbar,.webauto-menu')) return; if (state.pickedEl===t) return; state.pickedEl=t; try{ if (state.hoverHiId){ window.__webautoHighlight?.removeHighlight(state.hoverHiId); state.hoverHiId=null; } state.hoverHiId = window.__webautoHighlight?.createHighlight(t,{ color:'#34c759', label:'HOVER', persist:true, duration:0, scrollIntoView:false, alias:'picker-hover' }); }catch{} }
    function updateToolbarUI(){ try{ if (state.btn){ state.btn.textContent = state.picking ? 'Pick: ON' : 'Pick: OFF'; state.btn.style.background = state.picking ? '#34c759' : '#2c2c2c'; } }catch{} }
    function setPick(on, opts){ state.picking=!!on; updateToolbarUI(); if (state.picking) { document.addEventListener('click', onDocClick, true); document.addEventListener('mousemove', onMove, true); console.log('[picker] pick=ON'); } else { document.removeEventListener('click', onDocClick, true); document.removeEventListener('mousemove', onMove, true); if (state.hoverHiId){ try{ window.__webautoHighlight?.removeHighlight(state.hoverHiId); }catch{} state.hoverHiId=null; } if (!(opts&&opts.keepMenu)) hideMenu(); console.log('[picker] pick=OFF'); } }
    // toolbar (deferred until DOM ready)
    function mountToolbar(){
      if (document.getElementById('webauto-toolbar')) return;
      ensureCSS();
      const bar=document.createElement('div'); bar.className='webauto-toolbar'; bar.id='webauto-toolbar';
      const btn=document.createElement('button'); btn.id='webauto-pick-btn'; btn.textContent='Pick: OFF'; btn.onclick=(e)=>{ e.stopPropagation(); setPick(!state.picking); };
      state.btn = btn; updateToolbarUI();
      bar.appendChild(btn); (document.body||document.documentElement).appendChild(bar);
    }
    function onReady(fn){ if (document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', fn, { once:true }); } else { try{ fn(); }catch{} } }
    onReady(mountToolbar);
    window.__webautoPicker = { start: ()=>{ onReady(()=>setPick(true)); }, stop: ()=>setPick(false), getState: ()=>({ picking: state.picking }) };
  })();`;

  if (idxObj) await context.addInitScript((i)=>{ window.__containerIndex = i; }, idxObj);
  if (hs) await context.addInitScript(hs);
  await context.addInitScript(pickerJS);
  // preload saved picks to window for menu usage
  try {
    const picksRoot = path.join(process.cwd(), 'containers', 'test', 'weibo', 'picks');
    let arr = [];
    if (fs.existsSync(picksRoot)) {
      const files = fs.readdirSync(picksRoot).filter(n=>n.endsWith('.json')).sort().slice(-50);
      arr = files.map(n=>{ try{ const j=JSON.parse(fs.readFileSync(path.join(picksRoot,n),'utf8')); return { id:n, ts:j.timestamp, selector:j.selector, containerId:j.containerId, containerSelector:j.containerSelector, pageUrl:j.pageUrl, classChoice: j.classChoice||'' }; } catch { return null; } }).filter(Boolean);
    }
    await context.addInitScript((list)=>{ window.__webautoSavedPicks = Array.isArray(list)?list:[]; }, arr);
  } catch {}
  // inject actions lists for menu
  try {
    const act = require('../src/modules/executable-container/node/actions-loader.cjs');
    const evts = (act.loadEvents(site)||{}).events || [];
    const ops = (act.loadOperations(site)||{}).operations || [];
    await context.addInitScript((ev,op)=>{ window.__webautoEvents = ev; window.__webautoOps = op; }, evts, ops);
  } catch (e) { console.warn('failed to inject actions:', e.message); }

  // monitor pages (new tabs/redirects)
  context.on('page', async (p) => {
    try { await p.bringToFront(); } catch {}
    console.log('[context] new page:', p.url());
  });

  const page = await context.newPage();
  await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e=>console.warn('goto warn:', e.message));
  console.log('Weibo opened. Picker is active. This process will stay until you close the browser.');
  await new Promise(resolve => browser.on('disconnected', resolve));
}

main().catch(e => { console.error(e); process.exit(1); });
