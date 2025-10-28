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

    await context.exposeBinding('webauto_dispatch', async (source, evt) => {
      try { console.log('[picker evt]', JSON.stringify(evt)); } catch {}
      const page = source?.page;
      if (!page) return;
      if (evt?.type === 'picker:operation' && evt?.data?.opKey) {
        const selector = evt?.data?.selector || '';
        try {
          const res = await actionExec.executeOperation(page, null, site, evt.data.opKey, selector);
          console.log('[op result]', evt.data.opKey, res?.success);
        } catch (e) { console.warn('op exec warn:', e.message); }
      }
      if (evt?.type === 'picker:operation:custom') {
        await savePick(page, evt?.data || {});
      }
      if (evt?.type === 'picker:save') {
        await savePick(page, evt?.data || {});
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
          '.webauto-menu{position:fixed;background:#1e1e1e;color:#fff;padding:8px 10px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.4);z-index:'+Z+';font:12px/1.4 Arial;min-width:260px;pointer-events:auto;}'+
          '.webauto-menu .row{margin:6px 0;}'+
          '.webauto-menu label{display:block;color:#aaa;margin-bottom:4px;}'+
          '.webauto-menu select, .webauto-menu input{width:100%;padding:4px 6px;border-radius:6px;border:1px solid #444;background:#2c2c2c;color:#fff;}'+
          '.webauto-menu .actions button{margin-right:6px;margin-top:6px;}';
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
      // 选择器输入（当前 CSS）
      const row1=document.createElement('div'); row1.className='row'; const l1=document.createElement('label'); l1.textContent='当前选择器(CSS)'; const i1=document.createElement('input'); i1.value=sel; i1.readOnly=false; i1.id='webauto-menu-sel'; row1.appendChild(l1); row1.appendChild(i1);
      const updateByClass = ()=>{ const c=clsSelect.value; if (!c) return; const t=el.tagName?.toLowerCase()||'div'; i1.value = t + '.' + CSS.escape(c); };
      clsSelect.onchange = (ev)=>{ ev.stopPropagation(); updateByClass(); };
      modeChk.onchange = () => { const xpathOn = modeChk.checked; i1.disabled = !xpathOn ? false : false; sel2.disabled = xpathOn; };
      const row3=document.createElement('div'); row3.className='row actions'; const bHi=document.createElement('button'); bHi.textContent='高亮'; bHi.onclick=(ev)=>{ ev.stopPropagation(); try{ window.__webautoHighlight?.createHighlight(el,{color:'#34c759',label:'PICK',duration:4000}); }catch{} };
      const bClickMouse=document.createElement('button'); bClickMouse.textContent='点击(鼠标)'; bClickMouse.onclick=(ev)=>{ ev.stopPropagation(); const s = i1.value || sel; window.webauto_dispatch?.({ type:'picker:operation', data:{ opKey:'click-playwright', selector: s } }); };
      const bClickDom=document.createElement('button'); bClickDom.textContent='点击(DOM)'; bClickDom.onclick=(ev)=>{ ev.stopPropagation(); const s = i1.value || sel; window.webauto_dispatch?.({ type:'picker:operation', data:{ opKey:'click-dom', selector: s } }); };
      const bCopy=document.createElement('button'); bCopy.textContent='复制选择器'; bCopy.onclick=(ev)=>{ ev.stopPropagation(); const useXPath = modeChk.checked; const s = useXPath ? (i1.value||sel) : ((sel2.selectedOptions[0]&&sel2.selectedOptions[0].dataset&&sel2.selectedOptions[0].dataset.selector)||sel); navigator.clipboard?.writeText(s); };
      const bClose=document.createElement('button'); bClose.textContent='关闭'; bClose.onclick=(ev)=>{ ev.stopPropagation(); hideMenu(); };
      row3.appendChild(bHi); row3.appendChild(bClickMouse); row3.appendChild(bClickDom); row3.appendChild(bCopy); row3.appendChild(bClose);
      wrap.appendChild(row2); wrap.appendChild(rowParent); wrap.appendChild(rowMode); wrap.appendChild(row1); wrap.appendChild(row3); wrap.style.visibility='hidden'; document.body.appendChild(wrap); state.menu=wrap;
      try{
        const m=wrap.getBoundingClientRect();
        let left=Math.max(6, r.left);
        let top=r.bottom+6;
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
  // enhance picker menu: enforce CSS default, add class-first flow, container tree, and custom operation input
  await context.addInitScript(`(() => {
    function q1(root, sel){ try{ return root.querySelector(sel); }catch{ return null; } }
    function qall(root, sel){ try{ return Array.from(root.querySelectorAll(sel)); }catch{ return []; } }
    function getSelInput(menu){ const inputs=qall(menu,'input[type=text]'); return inputs[0] || null; }
    function getModeSelect(menu){ const sels=qall(menu,'select'); // heuristic: the second select is often mode
      if (sels.length>=2) return sels[1]; return sels[sels.length-1]||null; }
    function getContainerSelect(menu){ const sels=qall(menu,'select'); return sels[0] || null; }
    function getClassesFromSelector(sel){ try{ const el=document.querySelector(sel); if(!el) return []; const arr=(el.className||'').toString().split(/\\s+/).filter(Boolean); return Array.from(new Set(arr)); }catch{ return []; } }
    function buildContainerTreeFromSelector(sel){ const out=[]; try{ const el=document.querySelector(sel)||document.querySelector(window.__webautoTmpSelector||''); if(!el) return out; const idx=window.__containerIndex; if(!idx||!Array.isArray(idx.containers)) return out; let n=el; let depth=0; while(n && n.nodeType===1){ const matches=[]; for(const c of idx.containers){ const s=c.selector; if(!s) continue; try{ if(n.matches(s)) matches.push({id:c.id, selector:s}); }catch(_){} } if(matches.length) out.push({depth, matches}); if(n===document.documentElement) break; n=n.parentElement; depth++; } }catch{} return out; }
    function makeRow(labelText){ const row=document.createElement('div'); row.className='row'; const lab=document.createElement('label'); lab.textContent=labelText; row.appendChild(lab); return { row, lab }; }
    function augment(menu){ try{
      // default CSS mode
      const modeSel = getModeSelect(menu); if (modeSel) { try{ modeSel.value='css'; modeSel.dispatchEvent(new Event('change')); }catch{} }
      // selector input
      const selInput = getSelInput(menu); if (!selInput) return; try{ selInput.id = 'webauto-menu-sel'; }catch{}
      const containerSel = getContainerSelect(menu);
      const currentSel = selInput.value || (window.__webautoTmpSelector||'');
      // class-first row
      const { row: clsRow } = makeRow('类选择（首选）');
      const clsSelect = document.createElement('select');
      const clss = getClassesFromSelector(currentSel); if (clss.length){ clss.forEach(cn=>{ const o=document.createElement('option'); o.value=cn; o.textContent=cn; clsSelect.appendChild(o); }); } else { const o=document.createElement('option'); o.value=''; o.textContent='(无类)'; clsSelect.appendChild(o); }
      clsSelect.onchange = (ev)=>{ ev.stopPropagation(); const c=clsSelect.value; if(!c) return; try{ const el=document.querySelector(currentSel)||document.querySelector(window.__webautoTmpSelector||''); const t=el?.tagName?.toLowerCase()||'div'; selInput.value = t + '.' + CSS.escape(c); }catch{} };
      clsRow.appendChild(clsSelect);
      // insert before selector row
      const firstText = selInput; if (firstText && firstText.parentElement) {
        firstText.parentElement.parentElement.insertBefore(clsRow, firstText.parentElement);
      }
      // container tree row
      const { row: treeRow } = makeRow('父容器树'); const treeWrap = document.createElement('div'); treeWrap.style.maxHeight='140px'; treeWrap.style.overflow='auto'; treeWrap.style.border='1px solid #333'; treeWrap.style.padding='6px'; treeWrap.style.borderRadius='6px'; treeRow.appendChild(treeWrap);
      const renderTree = ()=>{ treeWrap.innerHTML=''; const tree=buildContainerTreeFromSelector(selInput.value||currentSel); if(!tree.length){ treeWrap.textContent='无匹配容器'; return; } tree.forEach(level=>{ const line=document.createElement('div'); line.style.margin='4px 0'; const d=document.createElement('span'); d.textContent='层级 '+level.depth+': '; d.style.color='#888'; line.appendChild(d); level.matches.forEach((m,idx)=>{ const b=document.createElement('button'); b.textContent=m.id; b.style.marginRight='6px'; b.style.padding='2px 6px'; b.style.borderRadius='4px'; b.style.border='1px solid #444'; b.style.background='#2c2c2c'; b.style.color='#fff'; b.onclick=(ev)=>{ ev.stopPropagation(); if (containerSel){ const opt=[...containerSel.options].find(o=>o.textContent.includes(m.id)); if(opt) containerSel.value=opt.value; } }; line.appendChild(b); if(idx<level.matches.length-1){ const sep=document.createElement('span'); sep.textContent='· '; sep.style.color='#555'; line.appendChild(sep); } }); treeWrap.appendChild(line); }); };
      renderTree();
      // place treeRow under container select (row2)
      const selects = qall(menu,'select'); if (selects.length){ const row2 = selects[0].parentElement; row2.parentElement.insertBefore(treeRow, row2.nextSibling); }
      // 操作选择（来自动作库）
      const opsRow = document.createElement('div'); opsRow.className='row'; const opsLabel=document.createElement('label'); opsLabel.textContent='操作选择(库)'; const opsSelect=document.createElement('select');
      const ops = Array.isArray(window.__webautoOps) ? window.__webautoOps : [];
      ops.forEach(op=>{ try{ const o=document.createElement('option'); o.value=op.key; o.textContent = (op.label||op.key) + ' (' + op.key + ')'; opsSelect.appendChild(o); }catch{} });
      const opsBtn = document.createElement('button'); opsBtn.textContent='执行选择'; opsBtn.onclick=(ev)=>{ ev.stopPropagation(); const opKey = opsSelect.value; if (!opKey) return; window.webauto_dispatch?.({ type:'picker:operation', data:{ opKey, selector: selInput.value || currentSel } }); };
      opsRow.appendChild(opsLabel); opsRow.appendChild(opsSelect); opsRow.appendChild(opsBtn); menu.appendChild(opsRow);

      // 自定义操作输入 + 保存测试容器
      const customRow = document.createElement('div'); customRow.className='row'; const customInput=document.createElement('input'); customInput.type='text'; customInput.placeholder='输入自定义操作（如：点击第3个关注）'; const customBtn=document.createElement('button'); customBtn.textContent='保存测试容器'; customBtn.onclick=(ev)=>{ ev.stopPropagation(); const opt=sel2.selectedOptions[0]; const payload = { selector: selInput.value || currentSel, classChoice: clsSelect.value, containerId: (opt && opt.value!=='__custom__') ? opt.value : '', containerSelector: (opt && opt.dataset && opt.dataset.selector) ? opt.dataset.selector : '', containerTree: buildContainerTreeFromSelector(selInput.value||currentSel), prompt: customInput.value||'' }; window.webauto_dispatch?.({ type:'picker:save', data: payload }); };
      customRow.appendChild(customInput); customRow.appendChild(customBtn); menu.appendChild(customRow);
    }catch(e){ /* noop */ }
    }
    function install(){
      const mo = new MutationObserver((recs)=>{
        for (const r of recs){ for (const n of r.addedNodes){ if (n && n.nodeType===1 && n.classList && n.classList.contains('webauto-menu')){ try{ augment(n); }catch{} } } }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();
  })();`);
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
