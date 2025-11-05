(function(){
  if (window.__elementPickerInstalled) {
    return { ok:true, msg:'picker already installed', last: window.__pickedSelector || null };
  }
  window.__elementPickerInstalled = true;
  function cssPath(el){
    if (!el || el.nodeType !== 1) return '';
    var path=[], node=el;
    while (node && node.nodeType===1 && node !== document){
      var selector=node.nodeName.toLowerCase();
      if (node.id){ selector += '#'+node.id; path.unshift(selector); break; }
      else{
        var sib=node, nth=1;
        while ((sib=sib.previousElementSibling)) if (sib.nodeName===node.nodeName) nth++;
        selector += (nth>1?`:nth-of-type(${nth})`:'' );
      }
      path.unshift(selector); node=node.parentElement;
    }
    return path.join(' > ');
  }
  function highlight(el,color){
    try{ var r=el.getBoundingClientRect(); var box=document.createElement('div'); box.className='wa-picker';
      box.style.cssText='position:fixed;left:'+(r.x-2)+'px;top:'+(r.y-2)+'px;width:'+(r.width+4)+'px;height:'+(r.height+4)+'px;border:2px solid '+(color||'#3c98ff')+';border-radius:6px;pointer-events:none;z-index:2147483647';
      document.body.appendChild(box); setTimeout(function(){ try{box.remove();}catch{} }, 1500);
    }catch{}
  }
  function onClick(e){
    e.preventDefault(); e.stopPropagation();
    var el=e.target; window.__pickedSelector = cssPath(el);
    highlight(el, '#3c98ff');
    console.log('[picker] selected:', window.__pickedSelector);
  }
  document.addEventListener('click', onClick, true);
  return { ok:true, msg:'picker installed (click element to select)', last: null };
})();

