/*
  1688 主页 - 清理遮罩/弹层并聚焦搜索框

  - 移除常见遮罩：#launch-MUTEX, #dialog-pulgin-guide 及类名包含 _dialog-pulgin-guide_
  - 自动点击“使用网页版/仍使用网页/留在网页”等提示
  - 聚焦输入框：input[name=keywords] / #alisearch-input
*/

(() => {
  function clickWebButtons() {
    try {
      const btn = Array.from(document.querySelectorAll('button,[role=button],a'))
        .find(b => (/使用网页版|优先使用网页版|继续使用网页版|仍使用网页|留在网页|仅使用网页版/).test((b.innerText||'').trim()));
      if (btn) btn.click();
    } catch {}
  }
  try {
    const ids = ['launch-MUTEX','dialog-pulgin-guide'];
    for (const id of ids) { const el = document.getElementById(id); if (el) el.remove(); }
    const masks = Array.from(document.querySelectorAll('[class*=_dialog-pulgin-guide_], .overlap, .modal, .dialog'));
    for (const el of masks) { try { el.remove(); } catch {} }
    clickWebButtons();
    const input = document.querySelector('input[name=keywords], #alisearch-input');
    if (input) { try { input.focus(); } catch {} return { ok: true, focused: true } }
    return { ok: true, focused: false };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})();

