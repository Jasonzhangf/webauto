(() => {
  const q = sel => document.querySelector(sel);
  const host = window.__cfg?.host || location.origin;

  async function api(path, opt={}){ const r = await fetch(host + path, { method: opt.method||'GET', headers:{ 'content-type':'application/json' }, body: opt.body? JSON.stringify(opt.body): undefined }); return await r.json(); }

  const siteEl = q('#site');
  const rootsEl = q('#roots');
  const rootIdEl = q('#rootId');
  const treeEl = q('#tree');
  const msgEl = q('#msg');

  const cid = q('#cid'); const cname = q('#cname'); const ctype = q('#ctype'); const cscope = q('#cscope'); const cclasses = q('#cclasses'); const cchildren = q('#cchildren'); const cparent = q('#cparent'); const crunMode = q('#crunMode'); const cops = q('#cops');

  function showMsg(s){ msgEl.textContent = s; }

  async function loadRoots(){
    const site = siteEl.value.trim(); if (!site) return;
    const data = await api(`/v1/debug/library/roots?site=${encodeURIComponent(site)}`);
    rootsEl.innerHTML='';
    (data.roots||[]).forEach(id=>{ const li=document.createElement('li'); li.textContent=id; li.onclick=()=>{ rootIdEl.value=id; loadTree(); loadContainer(id); }; rootsEl.appendChild(li); });
  }

  async function loadTree(){
    const site = siteEl.value.trim(); const rootId = rootIdEl.value.trim(); if (!site||!rootId) return;
    const data = await api(`/v1/debug/library/tree?site=${encodeURIComponent(site)}&rootId=${encodeURIComponent(rootId)}`);
    function render(node, depth=0){ if(!node) return ''; const pad = '&nbsp;'.repeat(depth*2); let html = `<div data-id="${node.id}">${pad}└─ ${node.id}</div>`; (node.children||[]).forEach(c=> html += render(c, depth+1)); return html; }
    treeEl.innerHTML = render(data.tree);
    treeEl.querySelectorAll('[data-id]').forEach(el=> el.onclick = ()=> loadContainer(el.getAttribute('data-id')) );
  }

  async function loadContainer(id){
    const site = siteEl.value.trim(); if (!site) return;
    const data = await api(`/v1/debug/library/container/${encodeURIComponent(id)}?site=${encodeURIComponent(site)}`);
    if (!data.success){ showMsg('未找到容器: '+id); return; }
    const d = data.def;
    cid.value = d.id||''; cname.value = d.name||''; ctype.value = d.type||''; cscope.value = d.scope||'';
    const classes = (d.selectors && d.selectors[0] && d.selectors[0].classes)||[];
    cclasses.value = (classes||[]).join('.');
    cchildren.value = (d.children||[]).join(',');
    crunMode.value = d.runMode || 'sequential';
    cops.value = JSON.stringify(d.operations || [{type:'find-child'}]);
  }

  async function saveContainer(){
    const site = siteEl.value.trim(); if (!site) return;
    const def = {
      id: cid.value.trim(), name: cname.value.trim(), type: ctype.value.trim(), scope: cscope.value.trim(),
      selectors: [{ classes: cclasses.value.trim().split('.').filter(Boolean) }],
      children: cchildren.value.trim() ? cchildren.value.trim().split(',').map(s=>s.trim()).filter(Boolean) : [],
      runMode: crunMode.value || 'sequential',
      operations: JSON.parse(cops.value || '[]')
    };
    const body = { site, def };
    if (cparent.value.trim()) body.parentId = cparent.value.trim();
    if (rootIdEl.value.trim()) body.rootId = rootIdEl.value.trim();
    const r = await api('/v1/debug/container/save', { method:'POST', body });
    showMsg(r.success ? `已保存: ${r.fileName}（共 ${r.count} 个）` : ('保存失败: '+(r.error||'')));
  }

  async function previewHighlight(){
    const site = siteEl.value.trim(); if (!site) return;
    // 需要 sessionId 来驱动页面侧预览，这里仅调用容器服务 /v1/debug/highlight/test 时需要 sessionId
    const sessionId = prompt('输入 sessionId 以在当前页面高亮预览');
    if (!sessionId) return;
    const classes = cclasses.value.trim().split('.').filter(Boolean);
    const r = await api('/v1/debug/highlight/test', { method:'POST', body:{ sessionId, selector: { classes } } });
    showMsg(r.success ? '已预览高亮（红）' : ('预览失败: '+(r.error||'')));
  }

  async function pathPreview(){
    const site = siteEl.value.trim(); if (!site) return;
    const sessionId = prompt('输入 sessionId 以预览路径'); if (!sessionId) return;
    const classes = cclasses.value.trim().split('.').filter(Boolean);
    const body = { sessionId, site, rootId: rootIdEl.value.trim() || null, parentId: cparent.value.trim() || null, selector: { classes } };
    const r = await api('/v1/debug/container/path/preview', { method:'POST', body });
    showMsg(r.success ? `已预览路径：${(r.path||[]).join(' → ')}` : ('路径预览失败: '+(r.error||'')));
  }

  q('#btnLoadRoots').onclick = loadRoots;
  q('#btnLoadTree').onclick = loadTree;
  q('#btnSave').onclick = saveContainer;
  q('#btnPreview').onclick = previewHighlight;
  q('#btnPathPreview').onclick = pathPreview;
})();
