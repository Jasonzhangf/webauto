/* Pick first search item inside strict list container and mark its ww-link */
(() => {
  function vis(el){ try{ const s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r=el.getBoundingClientRect(); return r.width>10 && r.height>10 && r.y < innerHeight && r.bottom>0; }catch{return false} }
  function overlay(el,label,color){ try{ const r=el.getBoundingClientRect(); const box=document.createElement('div'); box.style.cssText=`position:fixed;left:${r.x-3}px;top:${r.y-3}px;width:${r.width+6}px;height:${r.height+6}px;border:3px solid ${color||'#0a84ff'};border-radius:6px;background:transparent;pointer-events:none;z-index:2147483647`; const tag=document.createElement('div'); tag.textContent=label||'ITEM'; tag.style.cssText=`position:fixed;left:${r.x}px;top:${Math.max(0,r.y-18)}px;padding:1px 4px;background:${color||'#0a84ff'};color:#fff;border-radius:3px;font:12px -apple-system,system-ui;z-index:2147483647`; document.body.appendChild(box); document.body.appendChild(tag); }catch{} }
  try{
    const list = document.querySelector('.space-common-offerlist');
    if (!list) return { ok:false, error:'list(.space-common-offerlist) not found' };
    const items = Array.from(list.querySelectorAll('.search-offer-item'));
    let picked = null;
    for (const it of items){ const ww = it.querySelector("span.J_WangWang a.ww-link"); if (ww && vis(ww)) { picked = { it, ww }; break; } }
    if (!picked) return { ok:false, error:'no visible ww-link in .search-offer-item' };
    const { it, ww } = picked;
    function pickCompanyEl(item){
      const cands = Array.from(item.querySelectorAll('.desc-text, .offer-desc-item .desc-text, .offer-shop-row .desc-text'));
      let best=null, bestScore=-1;
      const boost=/公司|厂|店|科技|电子|有限公司/; const bad=/TOP|热卖|证书|认证|视频|包邮|天|小时|\d+\.?\d*\s*(件|元|套)/;
      for(const el of cands){ const txt=(el.innerText||el.textContent||'').trim(); if(!txt) continue; let s=txt.length; if(boost.test(txt)) s+=30; if(bad.test(txt)||txt.length<4) s-=40; try{ if(el.closest('.offer-desc-item, .offer-shop-row')) s+=10; }catch{} if(s>bestScore){best=el; bestScore=s;} }
      return best; }
    let companyName = '';
    const cn = pickCompanyEl(it);
    if (cn) companyName = (cn.innerText||cn.textContent||'').trim();
    try{ ww.setAttribute('data-webauto-send','1'); ww.scrollIntoView({behavior:'instant', block:'center'}); overlay(it,'ITEM','#0a84ff'); overlay(ww,'WW','#ff2d55'); }catch{}
    return { ok:true, selector:"[data-webauto-send='1']", variables:{ companyName } };
  }catch(e){ return { ok:false, error:String(e) }; }
})();
