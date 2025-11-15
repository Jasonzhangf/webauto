(() => {
  try {
    if (window.__webautoPicker) return;
    const HOST_ID = '__waPickerHost';
    const MENU_ID = '__webauto_picker_menu__';
    const OVERLAY_CLASS = '__webauto_picker_overlay__';
    const TREE_ID = '__webauto_container_tree__';

    function ensureHost(){
      let host = document.getElementById(HOST_ID);
      if (host) return host;
      host = document.createElement('div');
      host.id = HOST_ID;
      host.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483646;pointer-events:none;';
      (document.documentElement||document.body||document).appendChild(host);
      return host;
    }

    const host = ensureHost();
    const root = (host.attachShadow ? host.attachShadow({ mode:'open' }) : host);
    const style = document.createElement('style');
    style.textContent = `
      .${OVERLAY_CLASS} { position: absolute; pointer-events: none; z-index: 2147483646; box-sizing: border-box;}
      .${OVERLAY_CLASS}.__blue { outline: 3px solid #007aff; background: rgba(0,122,255,0.15); }
      .${OVERLAY_CLASS}.__red { outline: 3px solid #ff3b30; background: rgba(255,59,48,0.15); }
      #${MENU_ID} { position: fixed; top: 10px; right: 10px; z-index: 2147483647; font: 12px -apple-system,system-ui; background: rgba(0,0,0,0.75); color: #fff; border-radius: 10px; padding: 8px 10px; box-shadow: 0 2px 14px rgba(0,0,0,.3); pointer-events: auto; }
      #${MENU_ID} button { margin: 0 4px; padding: 4px 8px; border-radius: 6px; border: 0; background: #2b2b2b; color: #fff; cursor: pointer; }
      #${MENU_ID} input { width: 260px; padding: 4px 6px; border-radius: 6px; border: 0; margin-left: 6px; }
      #${MENU_ID} .small { opacity: 0.85; font-size: 11px; }
      #${TREE_ID} { position: fixed; top: 50px; right: 10px; max-height: 66vh; overflow: auto; background: rgba(0,0,0,0.82); color: #fff; z-index: 2147483647; padding: 10px 12px; border-radius: 10px; min-width: 320px; box-shadow: 0 2px 16px rgba(0,0,0,.35); pointer-events:auto; }
      #${TREE_ID} .node { padding: 2px 0; }
      #${TREE_ID} .node .id { opacity: 0.9; }
      #${TREE_ID} .node .name { opacity: 0.8; margin-left: 6px; }
      #${TREE_ID} .node .sel { opacity: 0.75; margin-left: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
      #${TREE_ID} .node button { margin-left: 8px; padding: 2px 6px; font-size: 11px; }
      #${TREE_ID} ul { list-style: none; padding-left: 16px; margin: 2px 0; }
      #${TREE_ID} li { margin: 1px 0; }
    `;
    root.appendChild(style);

    let enabled = false;
    let hovered = null; // { el, rect }
    let selected = null; // { el, rect, selector }
    let blue = null; // overlay element
    let reds = []; // array of overlays for preview

    function rectOf(el){ try{ const r = el.getBoundingClientRect(); return { x: r.left+window.scrollX, y:r.top+window.scrollY, w:r.width, h:r.height }; }catch{return null;} }
    function clearBlue(){ if(blue && blue.remove) try{ blue.remove(); }catch{} blue=null; }
    function drawBlue(rect){ clearBlue(); const o = document.createElement('div'); o.className = `${OVERLAY_CLASS} __blue`; o.style.left=rect.x+'px'; o.style.top=rect.y+'px'; o.style.width=rect.w+'px'; o.style.height=rect.h+'px'; document.body.appendChild(o); blue=o; }
    function clearReds(){ for(const r of reds){ try{ r.remove(); }catch{} } reds=[]; }
    function drawReds(rects){ clearReds(); for(const r of rects){ const o=document.createElement('div'); o.className=`${OVERLAY_CLASS} __red`; o.style.left=r.x+'px'; o.style.top=r.y+'px'; o.style.width=r.w+'px'; o.style.height=r.h+'px'; document.body.appendChild(o); reds.push(o);} }

    function classesSelectorFor(el){
      const cls = (el.className || '').toString().split(/\s+/).filter(Boolean).map(c=>c.replace(/^\./,'').trim());
      const uniq = Array.from(new Set(cls));
      if (!uniq.length) return null;
      return '.' + uniq.join('.');
    }

    function matchesForSelector(sel, scope){
      try {
        const root = scope || document;
        const els = Array.from(root.querySelectorAll(sel));
        return els.filter(el=>{
          const st = getComputedStyle(el); const r = el.getBoundingClientRect();
          return st.display!=='none' && st.visibility!=='hidden' && r.width>0 && r.height>0;
        });
      } catch { return []; }
    }

    function rectsForElements(list){ return list.map(el=>{ const r = el.getBoundingClientRect(); return { x: r.left+window.scrollX, y:r.top+window.scrollY, w:r.width, h:r.height };}); }

    function onMove(e){ if(!enabled) return; const el = e.target; if (!el) return; const rect = rectOf(el); if (!rect) return; hovered = { el, rect } ; drawBlue(rect); updateMenu(); }
    function onClick(e){ if(!enabled) return; try{ e.preventDefault(); e.stopPropagation(); }catch{} const el = e.target; const sel = classesSelectorFor(el); selected = { el, rect: rectOf(el), selector: sel }; updateMenu(); }

    function enable(){ if(enabled) return; enabled = true; document.addEventListener('mousemove', onMove, true); document.addEventListener('click', onClick, true); updateMenu(); }
    function disable(){ if(!enabled) return; enabled = false; document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); clearBlue(); clearReds(); updateMenu(); }
    function toggle(){ enabled ? disable() : enable(); }

    function ensureMenu(){ let m = root.getElementById ? root.getElementById(MENU_ID) : null; if (m) return m; m = document.createElement('div'); m.id = MENU_ID; root.appendChild(m); return m; }
    function ensureTreeWrap(){ let el=(root.getElementById?root.getElementById(TREE_ID):null); if (el) return el; el=document.createElement('div'); el.id=TREE_ID; root.appendChild(el); return el; }
    function getSessionId(){ try { if (window.__webautoSessionId) return String(window.__webautoSessionId); const el=document.getElementById('__waMiniMenu_sid'); return el?el.textContent:''; } catch { return ''; } }
    let lastSid = '';
    setInterval(()=>{ try{ const sid=getSessionId(); if (sid!==lastSid){ lastSid=sid; updateMenu(); } }catch{} }, 1000);
    function eTLD1(host){ try{ const p=String(host||location.hostname||'').split('.').filter(Boolean); return p.length>=2?p.slice(-2).join('.'):(host||location.hostname); }catch{return location.hostname;}}

    function siteLibrary(){ try{ const site=eTLD1(); const lib=window.__webautoContainerLibrary||{}; return lib[site]||null; }catch{return null;} }

    function highlightByClasses(classes){ try{ if(!classes||!classes.length) return; const sel='.'+classes.join('.'); const els=matchesForSelector(sel); drawReds(rectsForElements(els)); }catch{} }

    function buildTreeNode(node){
      const li=document.createElement('li'); li.className='node';
      const id=document.createElement('span'); id.className='id'; id.textContent=node.id;
      const name=document.createElement('span'); name.className='name'; if(node.name) name.textContent=' ('+node.name+')';
      const selSpan=document.createElement('span'); selSpan.className='sel'; if(Array.isArray(node.selectors)&&node.selectors.length){ selSpan.textContent='.'+node.selectors.join('.'); }
      const btnHi=document.createElement('button'); btnHi.textContent='高亮'; btnHi.onclick=(e)=>{ e.stopPropagation(); highlightByClasses(node.selectors||[]); };
      const btnEdit=document.createElement('button'); btnEdit.textContent='编辑'; btnEdit.onclick=(e)=>{ e.stopPropagation(); alert('仅本地编辑预览，持久化请用 DevTools'); };
      li.appendChild(id); li.appendChild(name); li.appendChild(selSpan); li.appendChild(btnHi); li.appendChild(btnEdit);
      if(Array.isArray(node.children)&&node.children.length){ const ul=document.createElement('ul'); node.children.forEach(c=> ul.appendChild(buildTreeNode(c))); li.appendChild(ul); }
      return li;
    }

    function renderTree(){
      const wrap=ensureTreeWrap();
      wrap.innerHTML='';
      const lib=siteLibrary();
      const title=document.createElement('div'); title.textContent='容器树（当前页库）'; title.style.cssText='font-weight:600;margin-bottom:6px;opacity:.9;'; wrap.appendChild(title);
      if(!lib||!Array.isArray(lib.roots)||!lib.roots.length){ const p=document.createElement('div'); p.textContent='无容器定义或尚未注入'; p.style.opacity='.8'; wrap.appendChild(p); return wrap; }
      const ul=document.createElement('ul'); lib.roots.forEach(r=> ul.appendChild(buildTreeNode(r))); wrap.appendChild(ul); return wrap;
    }

    function updateMenu(){
      const m = ensureMenu();
      const sid = getSessionId();
      const hov = hovered && hovered.rect ? `H:${Math.round(hovered.rect.w)}x${Math.round(hovered.rect.h)}` : 'H:-';
      const selText = selected && selected.selector ? selected.selector : '';
      m.innerHTML = '';
      const line1 = document.createElement('div');
      const sidLab=document.createElement('span'); sidLab.className='small'; sidLab.textContent='sessionID:'; line1.appendChild(sidLab);
      const sidVal=document.createElement('span'); sidVal.id='__waMiniMenu_sid_dup'; sidVal.textContent=sid||''; sidVal.style.marginLeft='6px'; sidVal.style.fontFamily='ui-monospace,monospace'; line1.appendChild(sidVal);
      const copy=document.createElement('button'); copy.textContent='复制SID'; copy.onclick=()=>{ try{ navigator.clipboard.writeText(String(sid||'')); copy.textContent='已复制'; setTimeout(()=>copy.textContent='复制SID',1200); }catch{} };
      line1.appendChild(copy);

      const pickBtn = document.createElement('button'); pickBtn.textContent = enabled ? '关闭拾取' : '启用拾取'; pickBtn.onclick = (e) => { e.stopPropagation(); toggle(); pickBtn.textContent = enabled ? '关闭拾取' : '启用拾取'; };
      const treeBtn = document.createElement('button'); treeBtn.textContent = '容器树'; treeBtn.onclick = (e) => { e.stopPropagation(); const w=document.getElementById(TREE_ID); if (w) { w.remove(); } else { renderTree(); } };

      const selBox = document.createElement('input'); selBox.placeholder = '当前选择的类选择器'; selBox.value = selText; selBox.oninput = () => { selected = { ...(selected||{}), selector: selBox.value }; };
      const prevBtn = document.createElement('button'); prevBtn.textContent = '预览'; prevBtn.onclick = (e) => { e.stopPropagation(); const els = matchesForSelector(selBox.value||''); drawReds(rectsForElements(els)); };

      line1.appendChild(pickBtn); line1.appendChild(treeBtn);
      const line2 = document.createElement('div'); line2.style.marginTop='6px';
      line2.appendChild(selBox); line2.appendChild(prevBtn);

      const small = document.createElement('div'); small.className='small'; small.textContent = hov; small.style.marginTop='4px';
      m.appendChild(line1); m.appendChild(line2); m.appendChild(small);
    }

    // public API for services
    window.__webautoPicker = {
      start: enable,
      stop: disable,
      toggle,
      getState(){ return { enabled, hovered: !!hovered, selected: (selected&&selected.selector)||'' }; },
      highlightAllRed(sel){ try{ const els=matchesForSelector(sel||''); drawReds(rectsForElements(els)); }catch{} },
      highlightCandidatesByClasses(classes){ highlightByClasses(classes); },
      _ensure(){ try{ if (!document.getElementById(HOST_ID)) { const h=ensureHost(); if (h && h.shadowRoot==null && h.attachShadow) { const r=h.attachShadow({mode:'open'}); r.appendChild(style.cloneNode(true)); } } }catch{} }
    };

    // Initial render
    updateMenu();
    // Keepalive: periodic and via mutation observer
    try{ setInterval(()=>{ try{ if (!document.getElementById(HOST_ID)) { ensureHost(); } }catch{} }, 1500); }catch{}
    try{
      const mo = new MutationObserver(()=>{ try{ if (!document.getElementById(HOST_ID)) ensureHost(); }catch{} });
      mo.observe(document.documentElement||document.body, { childList:true, subtree:true });
    }catch{}
  } catch (e) {
    try { console.warn('[webauto-picker] install error:', e); } catch {}
  }
})();
