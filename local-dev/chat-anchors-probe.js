// 在 air.1688.com 聊天页 Frame 中执行：整块高亮输入与发送区域，并打上稳定 data 属性。
(function(){
  function vis(el){try{var s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return false;var r=el.getBoundingClientRect();return r.width>20&&r.height>20;}catch(e){return false}}
  function markArea(el, color){ var r=el.getBoundingClientRect(); el.style.outline='3px solid '+color; el.style.borderRadius='8px'; el.style.boxShadow='inset 0 0 0 9999px '+(color==='#34c759'?'rgba(52,199,89,0.06)':'rgba(255,45,85,0.06)'); return {x:r.x,y:r.y,w:r.width,h:r.height}; }
  var out = { ok:true, steps:[] };
  try{
    // 输入区域
    var ed=document.querySelector("pre.edit[contenteditable='true']");
    if(ed){ var inpArea=ed.closest('.im-chat-input,.msg-input,.footer,.ft,.im-chat,.chat,form')||ed.parentElement||ed; inpArea.setAttribute('data-webauto-input-area','1'); ed.setAttribute('data-webauto-input','1'); try{inpArea.scrollIntoView({block:'center'})}catch(e){} var rr=markArea(inpArea,'#34c759'); out.steps.push({ inputArea:true, rect:rr }); }
    else { out.steps.push({ inputArea:false }); }
    // 发送区域
    var label=Array.from(document.querySelectorAll('span,button,a,[role=button]')).find(function(n){var t=(n.innerText||n.textContent||'').trim();return t==='发送';});
    var btn=label?(label.closest('.im-chat-send-btn,.send-btn,.next-btn,button,[role=button]')||label):null;
    var wrap=btn?(btn.closest('.footer,.ft,.im-chat,.msg-input,.chat,form')||btn.parentElement):null;
    if(wrap){ wrap.setAttribute('data-webauto-send-area','1'); btn.setAttribute('data-webauto-send','1'); try{wrap.scrollIntoView({block:'center'})}catch(e){} var sr=markArea(wrap,'#ff2d55'); out.steps.push({ sendArea:true, rect:sr }); }
    else { out.steps.push({ sendArea:false }); }
  }catch(e){ out.ok=false; out.error=String(e); }
  return out;
})();

