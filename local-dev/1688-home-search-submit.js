/* 1688 首页内搜索提交脚本
 * 行为：
 * 1) 清理常见遮罩/弹层
 * 2) 定位搜索输入框，填入“钢化膜”（或 window.__WA_keyword）
 * 3) 优先点击“搜索”按钮，否则提交 form 或模拟回车
 */
(() => {
  function rmOverlays(){
    try {
      const ids=['launch-MUTEX','dialog-pulgin-guide'];
      ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.remove(); });
      const masks=[...document.querySelectorAll('[class*=_dialog-pulgin-guide_], .overlap, .modal, .dialog')];
      masks.forEach(el=>{ try{ el.remove(); }catch{} });
    } catch{}
  }
  function clickWebButtons(){
    try {
      const btn = Array.from(document.querySelectorAll('button,[role=button],a'))
        .find(b => (/使用网页版|优先使用网页版|继续使用网页版|仍使用网页|留在网页|仅使用网页版/).test((b.innerText||'').trim()));
      if (btn) btn.click();
    } catch {}
  }
  function setInput(val){
    const selList=['#alisearch-input','input[name=keywords]'];
    for (const sel of selList){
      const el=document.querySelector(sel); if(!el) continue;
      try{ el.focus(); }catch{}
      try{ el.value=val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }catch{}
      return el;
    }
    return null;
  }
  function submit(){
    const btn = document.querySelector('#alisearch-submit, #alisearch-button, .ali-search-button, button[type=submit]');
    if (btn) { try{ btn.click(); return 'button'; }catch{} }
    const input = document.querySelector('#alisearch-input, input[name=keywords]');
    const form = input ? input.closest('form') : document.querySelector('form#alisearch-form, form[action*="/offer_search"]');
    if (form) { try{ form.submit(); return 'form'; }catch{} }
    try{ document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',which:13,keyCode:13,bubbles:true})); return 'enter'; }catch{}
    return 'fallback-none';
  }
  try {
    rmOverlays();
    clickWebButtons();
    const kw = (window.__WA_keyword && String(window.__WA_keyword)) || '钢化膜';
    const input = setInput(kw);
    if (!input) return { ok:false, error:'input not found' };
    const via = submit();
    return { ok:true, via };
  } catch(e){ return { ok:false, error:String(e) } }
})();

