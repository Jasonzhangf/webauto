#!/usr/bin/env node
import http from 'node:http';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      `${UNIFIED_API}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (err) { resolve({ body }); } });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const result = await httpPost('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `
        (function() {
          const links = Array.from(document.querySelectorAll('a'));
          const visibleLinks = links.filter(a => {
            const r = a.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.top < window.innerHeight;
          }).slice(0, 5);
          
          return visibleLinks.map(a => ({
            tagName: a.tagName.toLowerCase(),
            className: a.className,
            text: a.textContent.substring(0, 20),
            rect: a.getBoundingClientRect()
          }));
        })()
      `
    }
  });
  console.log(JSON.stringify(result, null, 2));
}
main();
