(() => {
  try {
    const inp = document.querySelector('#alisearch-input, input[name="keywords"], input#alisearch-keywords');
    const info = { ok:true, inputFound: !!inp, inputId: inp?.id||null, inputName: inp?.name||null };
    const candidates = [];
    const root = (inp && inp.closest('form, .search, header, body')) || document;
    const els = Array.from(root.querySelectorAll('button, input[type="submit"], a, div, span'));
    for (const el of els) {
      const t=(el.innerText||el.value||el.title||'').trim();
      const id=el.id||null; const cls=el.className||'';
      const hit = /搜索|搜一下|Search|GO/i.test(t) || /search|submit/i.test(id||'') || /search|submit/i.test(cls||'');
      if (!hit) continue;
      const r = el.getBoundingClientRect(); const cs=getComputedStyle(el);
      const vis = r.width>20 && r.height>20 && r.y<innerHeight && cs.display!=='none' && cs.visibility!=='hidden' && Number(cs.opacity)>0;
      if (!vis) continue;
      candidates.push({ tag: el.tagName.toLowerCase(), id, cls, text: t, rect: { x:r.x,y:r.y,w:r.width,h:r.height } });
      if (candidates.length>=10) break;
    }
    info.candidates = candidates;
    return info;
  } catch(e){ return { ok:false, error: String(e) }; }
})();

