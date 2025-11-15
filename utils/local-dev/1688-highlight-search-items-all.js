/*
  1688 搜索页：高亮所有 item 与其旺旺链接（持续显示，元素内联描边）

  说明：
  - 仅在列表容器 .space-common-offerlist 内检索 .search-offer-item
  - 为每个 item 添加类高亮并标注 “ITEM #序号 · 公司名”，为每个 item 内首个 a.ww-link 添加类高亮并标注 “WW #序号”
  - 使用元素 outline/伪元素标签，不依赖坐标，确保对齐
  - 提供 window.__waHL_cleanup() 清理（移除样式与类）
*/
(() => {
  const cfg = {
    list: '.space-common-offerlist',
    item: '.search-offer-item',
    wwLink: [
      "span.J_WangWang a.ww-link",
      "a.ww-link[href*='air.1688.com']",
      "a.ww-link[href*='im.1688.com']"
    ],
    company: ['.desc-text']
  };

  // install stylesheet once
  (function installStyle(){
    if (document.getElementById('__waHL_style')) return;
    const st = document.createElement('style'); st.id='__waHL_style';
    st.textContent = `
      .wa-hl-list{ outline:2px solid #ff9500 !important; outline-offset:2px !important; border-radius:8px !important; position:relative !important; }
      .wa-hl-list[data-wa-label]:after{ content: attr(data-wa-label); position:absolute; left:0; top:-22px; background:#ff9500; color:#fff; padding:2px 8px; border-radius:4px; font:12px -apple-system,system-ui; z-index:2147483647 }
      .wa-hl-item{ outline:2px solid #0a84ff !important; outline-offset:2px !important; border-radius:6px !important; position:relative !important; }
      .wa-hl-item[data-wa-label]:after{ content: attr(data-wa-label); position:absolute; left:0; top:-18px; background:#0a84ff; color:#fff; padding:1px 6px; border-radius:4px; font:12px -apple-system,system-ui; z-index:2147483647 }
      .wa-hl-ww{ outline:2px solid #ff2d55 !important; outline-offset:2px !important; border-radius:4px !important; position:relative !important; }
      .wa-hl-ww[data-wa-label]:after{ content: attr(data-wa-label); position:absolute; left:0; top:-18px; background:#ff2d55; color:#fff; padding:1px 6px; border-radius:4px; font:12px -apple-system,system-ui; z-index:2147483647 }
    `;
    document.head.appendChild(st);
  })();

  // cleanup
  window.__waHL_cleanup = function(){
    try{
      const list = document.querySelector(cfg.list);
      if (list){ list.classList.add('wa-hl-list'); list.setAttribute('data-wa-label', 'LIST'); }
      document.querySelectorAll('.wa-hl-item').forEach(el=>{ el.classList.remove('wa-hl-item'); el.removeAttribute('data-wa-label'); });
      document.querySelectorAll('.wa-hl-ww').forEach(el=>{ el.classList.remove('wa-hl-ww'); el.removeAttribute('data-wa-label'); });
    }catch{}
  };
  window.__waHL_cleanup();

  function qOneOf(selectors, scope){
    const root = scope || document;
    for (const sel of selectors){ try{ const el = root.querySelector(sel); if (el) return el; }catch{} }
    return null;
  }

  function pickCompanyEl(item){
    // 从多个候选中选择最可能的公司名：
    // 规则：
    //  - 优先在“店铺/描述区域”命中的 .desc-text
    //  - 文本越长分越高；包含“公司/厂/店/科技/电子/有限公司”加权；
    //  - 过滤价格/促销等短文本
    const cands = Array.from(item.querySelectorAll('.desc-text, .offer-desc-item .desc-text, .offer-shop-row .desc-text')); 
    let best=null, bestScore=-1;
    const boost = /公司|厂|店|科技|电子|有限公司/;
    const bad = /TOP|热卖|证书|认证|视频|包邮|天|小时|\d+\.?\d*\s*(件|元|套)/;
    for (const el of cands){
      const txt = (el.innerText||el.textContent||'').trim();
      if (!txt) continue;
      let s = txt.length;
      if (boost.test(txt)) s += 30;
      if (bad.test(txt) || txt.length < 4) s -= 40;
      // 更靠近“店铺信息区域”的权重
      try{ if (el.closest('.offer-desc-item, .offer-shop-row')) s += 10; }catch{}
      if (s > bestScore){ best = el; bestScore = s; }
    }
    return best;
  }

  const list = document.querySelector(cfg.list);
  if (!list) return { ok:false, error:`list not found: ${cfg.list}` };
  const items = Array.from(list.querySelectorAll(cfg.item));

  let wwCount = 0; let itemCount = 0;
  items.forEach((it, i) => {
    try{ it.classList.add('wa-hl-item'); }catch{}
    const cn = pickCompanyEl(it) || qOneOf(cfg.company, it);
    const name = cn ? (cn.innerText||cn.textContent||'').trim() : '';
    try{ it.setAttribute('data-wa-label', `ITEM #${i}${name?(' · '+name):''}`); }catch{}
    itemCount++;
    const ww = qOneOf(cfg.wwLink, it);
    if (ww){ try{ ww.classList.add('wa-hl-ww'); ww.setAttribute('data-wa-label', `WW #${i}`); }catch{} wwCount++; }
  });

  return {
    ok:true,
    listSelector: cfg.list,
    itemSelector: cfg.item,
    wwLinkSelectors: cfg.wwLink,
    counts: { items: itemCount, ww: wwCount },
    cleanup: 'window.__waHL_cleanup()'
  };
})();
