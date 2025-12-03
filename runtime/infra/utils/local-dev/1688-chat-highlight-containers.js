/*
  1688 聊天页容器高亮脚本（严格按你提供的 class）
  - 根容器: .ww
  - 输入容器: .editBox（选择“可见且靠底部”的那一个，优先含 contenteditable/pre.edit）
  - 发送按钮: .btn-container（就近匹配输入框所在区域的按钮）

  特性:
  - 进入聊天 iframe（src 含 def_cbu_web_im_core）执行；找不到则退化到主文档。
  - 持久高亮（doc 内绘制），提供 window.__waHL_cleanup() 一键清理（含 frame）。

  用法:
  - REST: POST /v1/dev/eval-file  { sessionId, filePath: "local-dev/1688-chat-highlight-containers.js" }
  - 清理: 在 Console 运行 window.__waHL_cleanup()
*/

(() => {
  try {
    // 清理函数（全局挂载）
    function installCleanup() {
      try {
        window.__waHL_cleanup = function() {
          try {
            var xs = document.querySelectorAll('.wa-ovl, .wa-tag');
            for (var i = 0; i < xs.length; i++) xs[i].remove();
          } catch {}
          try {
            var ifr = Array.prototype.slice.call(document.querySelectorAll('iframe'))
              .find(function(f){ return (f && f.contentWindow && f.contentDocument && (f.src||'').indexOf('def_cbu_web_im_core') !== -1); });
            if (ifr && ifr.contentDocument) {
              var ys = ifr.contentDocument.querySelectorAll('.wa-ovl, .wa-tag');
              for (var j = 0; j < ys.length; j++) ys[j].remove();
            }
          } catch {}
          return 'cleared';
        };
      } catch {}
    }

    function rectOf(el) {
      try { return el.getBoundingClientRect(); } catch { return null; }
    }

    function mkOverlay(doc, rect, label, color) {
      var box = doc.createElement('div');
      box.className = 'wa-ovl';
      box.style.position = 'fixed';
      box.style.left = (rect.left - 3) + 'px';
      box.style.top = (rect.top - 3) + 'px';
      box.style.width = (rect.width + 6) + 'px';
      box.style.height = (rect.height + 6) + 'px';
      box.style.border = '3px solid ' + color;
      box.style.borderRadius = '8px';
      box.style.background = 'rgba(0,0,0,0.03)';
      box.style.pointerEvents = 'none';
      box.style.zIndex = 2147483647;

      var tag = doc.createElement('div');
      tag.className = 'wa-tag';
      tag.textContent = label;
      tag.style.position = 'fixed';
      tag.style.left = Math.max(0, rect.left) + 'px';
      tag.style.top = Math.max(0, rect.top - 20) + 'px';
      tag.style.padding = '2px 6px';
      tag.style.background = color;
      tag.style.color = '#fff';
      tag.style.borderRadius = '6px';
      tag.style.font = '12px -apple-system,system-ui';
      tag.style.zIndex = 2147483647;

      doc.body.appendChild(box);
      doc.body.appendChild(tag);
    }

    function highlightEl(doc, el, label, color) {
      if (!el) return false;
      try { el.scrollIntoView({ block: 'center' }); } catch {}
      var r = rectOf(el); if (!r || r.width < 2 || r.height < 2) return false;
      mkOverlay(doc, r, label, color);
      return true;
    }

    function isVisible(el) {
      try {
        var s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        var r = el.getBoundingClientRect();
        return r.width > 30 && r.height > 20 && r.y < innerHeight && r.bottom > 0;
      } catch { return false; }
    }

    function pickInput(root, doc) {
      var list = Array.prototype.slice.call(root.querySelectorAll('.editBox'));
      // 过滤可见，优先含 contenteditable 或 pre.edit，且更靠底部
      var scored = [];
      for (var i=0;i<list.length;i++){
        var el = list[i];
        if (!isVisible(el)) continue;
        var hasCE = !!el.querySelector('[contenteditable="true"], [contenteditable], pre.edit');
        var r = el.getBoundingClientRect();
        var score = (r.top) + (hasCE ? 2000 : 0) + (r.width * 0.001);
        scored.push({ el: el, r: r, score: score, hasCE: hasCE });
      }
      if (!scored.length) return null;
      scored.sort(function(a,b){ return b.score - a.score; });
      return scored[0].el;
    }

    function pickSend(root, inputEl) {
      var btns = Array.prototype.slice.call(root.querySelectorAll('.btn-container'));
      if (!btns.length) return null;
      var inR = rectOf(inputEl) || { left:0, top:0, right:0, bottom:0, x:0, y:0, width:0, height:0 };
      var best = null, bestDist = 1e9;
      for (var i=0;i<btns.length;i++){
        var b = btns[i]; if (!isVisible(b)) continue;
        var br = rectOf(b); if (!br) continue;
        // 垂直距离（优先和输入框同行/下方少量偏移）+ 横向靠右
        var vDist = Math.max(0, Math.abs((br.top + br.height/2) - (inR.top + inR.height/2)));
        var hBias = Math.max(0, br.left - (inR.right));
        var dist = vDist + hBias * 0.5;
        if (dist < bestDist) { bestDist = dist; best = b; }
      }
      return best || btns[0];
    }

    installCleanup();
    // 目标 iframe（聊天核心）
    var chatIframe = null;
    try {
      var ifs = Array.prototype.slice.call(document.querySelectorAll('iframe'));
      chatIframe = ifs.find(function(f){ return (f && (f.src||'').indexOf('def_cbu_web_im_core') !== -1); }) || null;
    } catch {}

    var doc = (chatIframe && chatIframe.contentDocument) ? chatIframe.contentDocument : document;
    var inFrame = !!chatIframe;
    var frameSrc = chatIframe ? chatIframe.src : null;

    var root = null, inputBox = null, sendBtn = null;
    try { root = doc.querySelector('.ww'); } catch {}
    if (root) {
      inputBox = pickInput(root, doc);
      if (inputBox) sendBtn = pickSend(root, inputBox);
      if (!sendBtn) { try { sendBtn = root.querySelector('.btn-container'); } catch {} }
    }

    var hr = highlightEl(doc, root, 'CHAT ROOT', '#0a84ff');
    var hi = highlightEl(doc, inputBox, 'INPUT', '#34c759');
    var hs = highlightEl(doc, sendBtn, 'SEND', '#ff9500');
    // 尝试高亮发送容器内真正可点击的按钮
    var innerBtn = null;
    try {
      if (sendBtn) {
        var cand = sendBtn.querySelector('button, .next-btn, .im-chat-send-btn, .send-btn, [role="button"], a, span');
        if (cand && isVisible(cand)) innerBtn = cand;
      }
    } catch {}
    var hb = innerBtn ? highlightEl(doc, innerBtn, 'SEND BTN', '#ff3b30') : false;

    return {
      ok: true,
      inFrame: inFrame,
      frameSrc: frameSrc,
      found: { root: !!root, input: !!inputBox, send: !!sendBtn },
      highlighted: { root: !!hr, input: !!hi, send: !!hs },
      rects: {
        root: root ? rectOf(root) : null,
        input: inputBox ? rectOf(inputBox) : null,
        send: sendBtn ? rectOf(sendBtn) : null,
        sendBtn: innerBtn ? rectOf(innerBtn) : null
      }
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})();
