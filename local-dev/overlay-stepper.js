(function(){
  try{
    var STEP = Number(window.__waOverlayStepperStep||1);
    var HOST_ID = '__waStepperHost';
    var root, host;
    function ensureHost(){
      host = document.getElementById(HOST_ID);
      if (!host) { host = document.createElement('div'); host.id=HOST_ID; host.style.cssText='position:fixed;top:8px;right:8px;z-index:2147483646;'; (document.documentElement||document.body).appendChild(host); }
      return host;
    }
    function attachShadow(){ try{ return host.attachShadow ? host.attachShadow({mode:'open'}) : host; }catch{return host;}}
    var info = { before: snapshot('before') };

    if (STEP>=1){ ensureHost(); }
    if (STEP>=2){ root = attachShadow(); var style=document.createElement('style'); style.textContent = '#__waStepperMenu{position:fixed;top:10px;right:10px;background:rgba(0,0,0,.75);color:#fff;padding:8px 10px;border-radius:10px;font:12px -apple-system,system-ui;z-index:2147483647}'; root.appendChild(style); }
    if (STEP>=3){ var div=document.createElement('div'); div.id='__waStepperMenu'; div.style.display='none'; (root||host).appendChild(div); }
    if (STEP>=4){ var m=(root||host).getElementById? (root||host).getElementById('__waStepperMenu'):document.getElementById('__waStepperMenu'); if(m) m.style.display='block'; }
    if (STEP>=5){ var m2=(root&&root.getElementById)? root.getElementById('__waStepperMenu') : document.getElementById('__waStepperMenu'); if(m2){ m2.textContent='Overlay Test Menu (no listeners)'; } }
    if (STEP>=6){ var m3=(root&&root.getElementById)? root.getElementById('__waStepperMenu') : document.getElementById('__waStepperMenu'); if(m3){ var b=document.createElement('button'); b.textContent='noop'; b.style.marginLeft='6px'; m3.appendChild(b);} }
    if (STEP>=7){ /* intentionally no listeners to isolate side-effects */ }

    info.after = snapshot('after');
    return info;

    function snapshot(tag){ try{ var b=document.body; var st=b?getComputedStyle(b):null; return { tag:tag, t:Date.now(), hasBody:!!b, childCount:b?b.children.length:0, textLen:b?(b.innerText||'').trim().length:0, disp:st?st.display:'', vis:st?st.visibility:'', op:st?st.opacity:'' }; }catch(e){ return { tag:tag, err:String(e) }; } }
  }catch(e){ return { ok:false, error:String(e) }; }
})();

