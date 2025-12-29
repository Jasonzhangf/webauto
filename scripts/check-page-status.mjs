import http from 'http';

async function main() {
  const resp = await fetch('http://127.0.0.1:7701/v1/controller/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'session:list',
      payload: {}
    })
  });
  
  const data = await resp.json();
  console.log('Session 信息:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
