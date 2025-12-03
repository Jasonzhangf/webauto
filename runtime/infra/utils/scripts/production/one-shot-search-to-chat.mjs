#!/usr/bin/env node
// One-shot: attach to existing search tab, pick one candidate by index,
// extract company name, skip if sent, else click WW link, type "你好" (no send),
// add to history by company name, close chat tab, return to search tab.

const host = process.env.WORKFLOW_HOST || 'http://127.0.0.1:7701';

function parseArgs(){
  const args = process.argv.slice(2);
  const opt = { sessionId: null, index: 0, company: null, message: '你好', delayMs: 2000, send: false, waitMinMs: 1000, waitMaxMs: 5000 };
  for(const a of args){
    if(a.startsWith('--sessionId=')) opt.sessionId = a.slice(12);
    else if(a.startsWith('--index=')) opt.index = Number(a.slice(8));
    else if(a.startsWith('--message=')) opt.message = a.slice(10);
    else if(a.startsWith('--company=')) opt.company = a.slice(10);
    else if(a.startsWith('--delay=')) opt.delayMs = Number(a.slice(8));
    else if(a === '--send' || a.startsWith('--send=')) opt.send = a === '--send' ? true : (a.split('=')[1] !== 'false');
    else if(a.startsWith('--waitMin=')) opt.waitMinMs = Number(a.slice(10));
    else if(a.startsWith('--waitMax=')) opt.waitMaxMs = Number(a.slice(10));
  }
  return opt;
}

async function j(u,opt){
  const r = await fetch(host+u, opt);
  return await r.json();
}
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
const rand = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;

async function getLatestSession(){
  try{ const r = await j('/v1/sessions'); const arr=r.sessions||[]; return arr[arr.length-1]||null; }catch{return null}
}

function extractScript(index, company){
  return `(()=>{ try{ var idx=${index}; var want=${JSON.stringify(company||'')};
    function vis(el){try{const s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return false; const r=el.getBoundingClientRect(); return r.width>18&&r.height>18&&r.y<innerHeight;}catch{return false}}
    function list(){return Array.from(document.querySelectorAll('.sm-offer-item, .offer-item, .sm-offer, [class*=offer]'));}
    const cards=list();
    if(want){
      const norm = (s)=>String(s||'').replace(/\s+/g,'').trim();
      let found = -1; let cname='';
      for(let i=0;i<cards.length;i++){
        const sels=['.desc-text','.company-name','.companyName','.seller-name','[data-spm*=company]','.shop-info a','.enterprise-name'];
        let tmp=''; for(const s of sels){ const el=cards[i].querySelector(s); if(el){ tmp=(el.innerText||el.textContent||'').trim(); if(tmp) break; }}
        if(tmp && (norm(tmp).includes(norm(want)) || norm(want).includes(norm(tmp)))){ found=i; cname=tmp; break; }
      }
      if(found>=0){ idx=found; window.__wwClickIndex = idx; window.__preferContact = cname; }
    }
    const card=cards[idx]||cards[0]; if(!card) return {ok:false, error:'no card'};
    const sels=['.desc-text','.company-name','.companyName','.seller-name','[data-spm*=company]','.shop-info a','.enterprise-name'];
    let cname=''; for(const s of sels){ const el=card.querySelector(s); if(el){ cname=(el.innerText||el.textContent||'').trim(); if(cname) break; }}
    const a=card.querySelector('span.J_WangWang a.ww-link, a.ww-link.ww-inline, a.ww-link[href*=air.1688.com], a.ww-link[href*=im.1688.com]');
    if(a && vis(a)) a.setAttribute('data-webauto-send','1');
    const href=a?(a.getAttribute('href')||a.href||''):'';
    return {ok:true, companyName:cname, href, index: idx};
  }catch(e){ return {ok:false, error:String(e)} } })();`;
}

async function main(){
  const opt = parseArgs();
  let sessionId = opt.sessionId || await getLatestSession();
  if(!sessionId){
    console.log(JSON.stringify({ ok:false, error:'no session available' }));
    process.exit(1);
  }

  // Attach to search tab only (do not open new pages)
  await j('/v1/browser/tab/attach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, urlPattern:'s\\.1688\\.com/.*', bringToFront:true, waitUntil:'domcontentloaded', timeout:20000})});

  // Extract company name & mark link in the chosen card
  const ext = await j('/v1/dev/eval-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, code: extractScript(opt.index, opt.company)})});
  const info = ext?.value||{}; const cname = info?.companyName||''; const href = info?.href||'';

  // Optional pre-check: if we have company name, skip early
  if (cname) {
    const chk = await j('/v1/contacts/1688/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ key: cname })});
    if(chk && chk.success && chk.exists){
      await j('/v1/contacts/1688/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ key: cname, extra:{ status:'skipped', at: Date.now() } })});
      console.log(JSON.stringify({ ok:true, status:'skipped', companyName:cname }));
      return;
    }
  }

  // Hint target index/name for clicker, then click ww-link using v2 clicker (no send)
  await j('/v1/dev/eval-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, code: `window.__wwClickIndex=${Number.isFinite(info.index)?info.index:opt.index}; window.__preferContact=${JSON.stringify(cname)}; 'ok';`})});
  await j('/v1/dev/eval-file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, filePath:'local-dev/1688-open-chat-clicker-v2.js'})});
  await sleep(opt.delayMs);

  // Attach chat and type message (no send)
  const att = await j('/v1/browser/tab/attach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, urlPattern:'air\\.1688\\.com/.*', bringToFront:true, waitUntil:'domcontentloaded', timeout:20000})});
  if(!att || !att.success){ console.log(JSON.stringify({ ok:false, step:'attach_chat', companyName:cname })); process.exit(1); }

  // Parse uid from chat URL and dedupe
  const urlRes = await j('/v1/browser/url?'+new URLSearchParams({sessionId}).toString());
  const chatUrl = urlRes?.url || urlRes?.value?.url || '';
  let uid = '';
  try { const u = new URL(chatUrl); uid = u.searchParams.get('uid') || u.searchParams.get('touid') || ''; } catch {}

  if (uid) {
    const chk2 = await j('/v1/contacts/1688/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ uid })});
    if (chk2 && chk2.success && chk2.exists) {
      await j('/v1/contacts/1688/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ uid, chatUrl, extra:{ status:'skipped-after-open', at: Date.now() } })});
      await j('/v1/browser/tab/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, hostIncludes:'air.1688.com', closeAll:false})});
      await j('/v1/browser/tab/attach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, urlPattern:'s\\.1688\\.com/.*', bringToFront:true, waitUntil:'domcontentloaded', timeout:20000})});
      console.log(JSON.stringify({ ok:true, status:'skipped-existed-uid', companyName:cname, uid }));
      return;
    }
  }

  const typeCode = `(()=>{ try{ var ed=document.querySelector(\"pre.edit[contenteditable='true'], .im-chat-input [contenteditable], .msg-input [contenteditable], div[contenteditable], textarea\"); if(!ed) return {ok:false}; ed.focus(); if(ed.tagName==='PRE'){ ed.innerText=${JSON.stringify(opt.message)}; ed.dispatchEvent(new InputEvent('input',{bubbles:true})); } else if('value' in ed){ ed.value=${JSON.stringify(opt.message)}; ed.dispatchEvent(new Event('input',{bubbles:true})); } return {ok:true}; }catch(e){ return {ok:false, err:String(e)} } })();`;
  await j('/v1/dev/eval-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, frame:{urlPattern:'def_cbu_web_im_core'}, code:typeCode})});

  // Real send if requested
  if (opt.send) {
    const sendCode = `(()=>{ try{ 
      function vis(el){ try{ const s=getComputedStyle(el); if(s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r=el.getBoundingClientRect(); return r.width>10&&r.height>10; }catch{return false} }
      const btn = Array.from(document.querySelectorAll('button,[role=button],a,span,div')).find(el=>{ 
        if(!vis(el)) return false; const t=(el.innerText||el.textContent||'').trim();
        return t.includes('发送') || t.includes('發送') || /(^|\b)send(\b|$)/i.test(t);
      });
      if (btn) { btn.click(); return {ok:true, via:'button'}; }
      // fallback: press Enter
      const ed=document.querySelector("pre.edit[contenteditable='true'], .im-chat-input [contenteditable], .msg-input [contenteditable], div[contenteditable]");
      if(ed){ ed.focus(); const kd=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}); ed.dispatchEvent(kd); const ku=new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}); ed.dispatchEvent(ku); return {ok:true, via:'enter'}; }
      return {ok:false}; 
    }catch(e){ return {ok:false, err:String(e)} } })();`;
    await j('/v1/dev/eval-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, frame:{urlPattern:'def_cbu_web_im_core'}, code: sendCode})});
    await sleep(rand(opt.waitMinMs, opt.waitMaxMs));
  }

  // Record history and close tab
  if (uid) {
    await j('/v1/contacts/1688/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ uid, chatUrl, key: cname||undefined, extra:{ reason: opt.send ? 'sent' : 'typed-only', message: opt.message, at: Date.now() } })});
  } else {
    await j('/v1/contacts/1688/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ key: cname||'(unknown)', extra:{ reason: opt.send ? 'sent' : 'typed-only', message: opt.message, at: Date.now() } })});
  }
  await j('/v1/browser/tab/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, hostIncludes:'air.1688.com', closeAll:false})});

  // Return to search tab
  await j('/v1/browser/tab/attach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId, urlPattern:'s\\.1688\\.com/.*', bringToFront:true, waitUntil:'domcontentloaded', timeout:20000})});

  console.log(JSON.stringify({ ok:true, status: opt.send ? 'sent' : 'opened', companyName:cname, href, uid }));
}

main().catch(e=>{ console.error(e); process.exit(1); });
