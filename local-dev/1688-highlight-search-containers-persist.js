/*
  1688 搜索页容器高亮（持续显示，单一命中）

  目标：
  - 仅选择 1 个根容器(ROOT)、1 个列表容器(LIST)、1 个单条容器(ITEM)、1 个旺旺链接(WW)
  - 高亮持续显示（不自动消失），提供一键清除函数 window.__waHL_cleanup()
  - 选择器可在 cfg 中集中配置，便于你随时调整

  用法：
  1) 打开 s.1688.com 搜索结果页控制台，将本文件全文粘贴执行
  2) 如需清除高亮：在控制台执行 window.__waHL_cleanup && __waHL_cleanup()
*/
(() => {
  const cfg = window.__waHL_config || {
    root: ['.search-ui2024', '.search-i18nUi', 'body'],
    list: ['.space-common-offerlist'],
    item: ['.search-offer-item'],
    wwLink: ["span.J_WangWang a.ww-link", "a.ww-link[href*='air.1688.com']", "a.ww-link[href*='im.1688.com']"],
    company: ['.desc-text', '.company-name', '.companyName', '.shop-name', "[data-spm*='company']", '.enterprise-name']
  };

  // 清理旧高亮
  window.__waHL_cleanup = function () {
    try {
      (window.__waHL_overlays || []).forEach(n => { try { n.remove(); } catch {} });
      window.__waHL_overlays = [];
    } catch {}
  };
  window.__waHL_cleanup();
  window.__waHL_overlays = [];

  function vis(el) {
    try {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 8 && r.height > 8 && r.y < innerHeight && r.bottom > 0;
    } catch { return false; }
  }

  function createOverlay(el, label, color) {
    if (!el) return false;
    try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch {}
    const r = el.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'wa-ol-box';
    box.style.cssText = `position:fixed;left:${r.x - 3}px;top:${r.y - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:3px solid ${color};border-radius:6px;background:rgba(0,0,0,0.05);pointer-events:none;z-index:2147483647`;
    const tag = document.createElement('div');
    tag.className = 'wa-ol-tag';
    tag.textContent = label || 'TARGET';
    tag.style.cssText = `position:fixed;left:${r.x}px;top:${Math.max(0, r.y - 20)}px;padding:2px 6px;background:${color};color:#fff;border-radius:4px;font:12px -apple-system,system-ui;z-index:2147483647`;
    document.body.appendChild(box); document.body.appendChild(tag);
    window.__waHL_overlays.push(box, tag);
    return true;
  }

  function firstVisible(selectors, scope) {
    const root = scope || document;
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el && vis(el)) return { el, sel };
      } catch {}
    }
    // 回退：返回第一个命中（即使不可见）
    for (const sel of selectors) {
      try { const el = root.querySelector(sel); if (el) return { el, sel }; } catch {}
    }
    return { el: null, sel: null };
  }

  function pickBestItem(listEl) {
    const scope = listEl || document;
    const all = Array.from(scope.querySelectorAll(cfg.item.join(',')));
    if (!all.length) return { it: null, reason: 'no items' };
    // 优先：同时有 ww-link 与公司名的可见项
    for (const it of all) {
      const ww = firstVisible(cfg.wwLink, it).el;
      const cn = firstVisible(cfg.company, it).el;
      if (ww && cn && vis(it)) return { it, reason: 'has ww+company visible' };
    }
    // 次选：含 ww-link 的可见项
    for (const it of all) {
      const ww = firstVisible(cfg.wwLink, it).el;
      if (ww && vis(it)) return { it, reason: 'has ww visible' };
    }
    // 次选：任一可见项
    for (const it of all) if (vis(it)) return { it, reason: 'visible item' };
    // 回退：首个
    return { it: all[0], reason: 'fallback first' };
  }

  function pickListByItem(itemEl) {
    // 自下而上找“包含多个 item 的祖先”作为列表容器
    let p = itemEl ? itemEl.parentElement : null;
    let best = null, bestCnt = 0, hops = 0;
    const q = cfg.item.join(',');
    while (p && p !== document.body && hops < 12) {
      let cnt = 0;
      try { cnt = p.querySelectorAll(q).length; } catch { cnt = 0; }
      if (cnt > bestCnt) { best = p; bestCnt = cnt; }
      p = p.parentElement; hops++;
    }
    return best;
  }

  // ROOT
  const rootPick = firstVisible(cfg.root, document);
  const ROOT = rootPick.el; if (ROOT) createOverlay(ROOT, 'ROOT', '#34c759');

  // ITEM 先选（更稳），再反推 LIST；若失败再直接找 LIST
  let LIST = null, ITEM = null, WW = null, COMPANY = null;
  const itemPick = pickBestItem(document);
  ITEM = itemPick.it;
  if (ITEM) {
    createOverlay(ITEM, 'ITEM', '#0a84ff');
    LIST = pickListByItem(ITEM);
  }
  if (!LIST) {
    const listPick = firstVisible(cfg.list, ROOT || document);
    LIST = listPick.el; if (LIST) createOverlay(LIST, 'LIST', '#ff9500');
  } else {
    createOverlay(LIST, 'LIST', '#ff9500');
  }

  // WW & COMPANY（仅从 ITEM 内取一条）
  if (ITEM) {
    const wwPick = firstVisible(cfg.wwLink, ITEM);
    WW = wwPick.el; if (WW) createOverlay(WW, 'WW', '#ff2d55');
    const compPick = firstVisible(cfg.company, ITEM);
    COMPANY = compPick.el;
  }

  const companyName = COMPANY ? (COMPANY.innerText || COMPANY.textContent || '').trim() : '';
  return {
    ok: !!(ROOT || LIST || ITEM || WW),
    selectors: cfg,
    found: {
      root: !!ROOT,
      list: !!LIST,
      item: !!ITEM,
      ww: !!WW,
      companyName
    },
    notes: {
      itemReason: itemPick.reason || null,
      listByItem: !!(ITEM && LIST)
    },
    cleanup: 'window.__waHL_cleanup()'
  };
})();
