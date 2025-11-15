(() => {
  const $ = sel => document.querySelector(sel);
  const log = (s) => { const el=$('#logs'); el.textContent += `[${new Date().toLocaleTimeString()}] ${s}\n`; el.scrollTop = el.scrollHeight; };

  async function post(url, body){ const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})}); if(!r.ok) throw new Error(`${url} -> ${r.status}`); return r.json(); }
  async function get(url){ const r=await fetch(url); if(!r.ok) throw new Error(`${url} -> ${r.status}`); return r.json(); }

  async function attach(){
    const sid=$('#sid').value.trim(); const host=$('#host').value.trim(); if(!sid||!host){ log('缺少 sid/host'); return; }
    const pat = host.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&');
    await post('http://127.0.0.1:7701/v1/browser/tab/attach',{ sessionId: sid, urlPattern: pat, bringToFront:true, waitUntil:'domcontentloaded', timeout:10000 });
    log(`附着: /${pat}/`);
  }
  async function keepHost(){
    const sid=$('#sid').value.trim(); const host=$('#host').value.trim(); if(!sid||!host){ log('缺少 sid/host'); return; }
    const pat = host.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&');
    await post('http://127.0.0.1:7701/v1/browser/tab/close-unmatched',{ sessionId: sid, keepUrlPattern: pat, alsoCloseBlank:true });
    log(`仅保留: ${host}`);
  }
  async function closeAutomation(){
    const sid=$('#sid').value.trim(); if(!sid){ log('缺少 sid'); return; }
    await post('http://127.0.0.1:7701/v1/browser/tab/close',{ sessionId: sid, hostIncludes:'automationcontrolled', closeAll:true });
    log('已关闭 automationcontrolled');
  }
  async function installPicker(){ const sid=$('#sid').value.trim(); await post('http://127.0.0.1:7703/v1/debug/picker/install',{ sessionId: sid }); log('菜单已安装（未启用）'); }
  async function enablePicker(){ const sid=$('#sid').value.trim(); await post('http://127.0.0.1:7703/v1/debug/picker/toggle',{ sessionId: sid, enabled:true }); log('拾取已启用'); }
  async function disablePicker(){ const sid=$('#sid').value.trim(); await post('http://127.0.0.1:7703/v1/debug/picker/toggle',{ sessionId: sid, enabled:false }); log('拾取已停止'); }
  async function hiLogin(){ const sid=$('#sid').value.trim(); await post('http://127.0.0.1:7701/v1/browser/highlight',{ sessionId: sid, selector: '.userAvatarLogo > div:nth-child(2)', color:'#00C853', label:'LOGIN', durationMs:2500, requireLoginAnchor:false }); log('已高亮登录锚点'); }
  async function hiCaptcha(){ const sid=$('#sid').value.trim(); const sels=['.nc-lang-cnt','[data-nc-lang]','.nc-container','[id*="nocaptcha"]','[class*="nocaptcha"]']; for(const s of sels){ try{ await post('http://127.0.0.1:7701/v1/browser/highlight',{ sessionId: sid, selector: s, color:'#FF3B30', label:'CAPTCHA', durationMs:2500, requireLoginAnchor:false }); log('已高亮风控'); return; }catch{} } log('风控未命中'); }

  async function loadTree(){
    const sid=$('#sid').value.trim(); const site=($('#site').value||'').trim()||($('#host').value||''); if(!sid||!site){ log('缺少 sid/site'); return; }
    const roots = await get(`http://127.0.0.1:7703/v1/debug/library/roots?site=${encodeURIComponent(site)}`);
    const treeEl=$('#tree'); treeEl.innerHTML='';
    if(!roots.success){ treeEl.textContent='加载失败'; return; }
    async function getNode(id){ const t=await get(`http://127.0.0.1:7703/v1/debug/library/tree?site=${encodeURIComponent(site)}&rootId=${encodeURIComponent(id)}`); if(!t.success||!t.tree) return null; async function enrich(n){ const d=await get(`http://127.0.0.1:7703/v1/debug/library/container/${encodeURIComponent(n.id)}?site=${encodeURIComponent(site)}`); const name=d?.def?.name||''; const sels=(d?.def?.selectors?.[0]?.classes)||[]; return { id:n.id, name, selectors:sels, children: await Promise.all((n.children||[]).map(enrich)) }; } return enrich(t.tree); }
    function render(node){ const div=document.createElement('div'); div.className='node'; const a=document.createElement('a'); a.href='#'; a.textContent=node.id; const span=document.createElement('span'); span.className='meta'; span.textContent=` ${node.name||''} .${(node.selectors||[]).join('.')}`; const btn=document.createElement('button'); btn.textContent='高亮'; btn.onclick=async(e)=>{ e.preventDefault(); const sid=$('#sid').value.trim(); const classes=node.selectors||[]; if(classes.length){ const sel='.'+classes.join('.'); try{ await post('http://127.0.0.1:7701/v1/browser/highlight',{ sessionId: sid, selector: sel, color:'#FF3B30', label:'CONTAINER', durationMs:2500, requireLoginAnchor:false }); }catch(e){ log('高亮失败:'+e.message); } } };
      div.appendChild(a); div.appendChild(span); div.appendChild(btn);
      if(node.children&&node.children.length){ const ul=document.createElement('div'); ul.style.marginLeft='14px'; node.children.forEach(c=> ul.appendChild(render(c))); div.appendChild(ul); }
      return div; }
    for (const rid of roots.roots||[]) { const n=await getNode(rid); if(n) treeEl.appendChild(render(n)); }
    log('容器树已加载');
  }

  $('#btnAttach').onclick = () => attach().catch(e=>log(e.message));
  $('#btnKeepHost').onclick = () => keepHost().catch(e=>log(e.message));
  $('#btnCloseAuto').onclick = () => closeAutomation().catch(e=>log(e.message));
  $('#btnInstall').onclick = () => installPicker().catch(e=>log(e.message));
  $('#btnEnable').onclick = () => enablePicker().catch(e=>log(e.message));
  $('#btnDisable').onclick = () => disablePicker().catch(e=>log(e.message));
  $('#btnHiLogin').onclick = () => hiLogin().catch(e=>log(e.message));
  $('#btnHiCaptcha').onclick = () => hiCaptcha().catch(e=>log(e.message));
  $('#btnLoadTree').onclick = () => loadTree().catch(e=>log(e.message));
  $('#btnPasteSid').onclick = async () => { try{ $('#sid').value = await navigator.clipboard.readText(); }catch{ } };
})();

