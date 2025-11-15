#!/usr/bin/env node
// Probe Browser MCP server and inspect anchors defined in config/anchors/1688-anchors.json
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { StdioClientTransport } = await import('../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js');
const { Client } = await import('../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js');

function log(...args){ console.log('[MCP]', ...args); }

async function main(){
  const anchorsPath = join(process.cwd(), 'config', 'anchors', '1688-anchors.json');
  const anchors = JSON.parse(readFileSync(anchorsPath, 'utf8'));

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@browsermcp/mcp@latest'],
    env: process.env
  });

  const client = new Client({ name: 'webauto-mcp-client', version: '0.0.1' });
  await client.connect(transport);
  log('connected');

  const tools = await client.listTools();
  log('tools:', tools.tools?.map(t=>t.name));

  // Helper to find a tool by partial name
  const findTool = (names) => {
    for (const n of names){
      const t = tools.tools?.find(x => x.name === n || x.name.includes(n));
      if (t) return t.name;
    }
    return null;
  };

  // Common tool guesses for Browser MCP
  const gotoTool = findTool(['navigate', 'goto', 'open', 'page.goto']);
  const waitTool = findTool(['waitForSelector', 'wait_for_selector', 'query.wait']);
  const frameTool = findTool(['selectFrame', 'frame.select', 'switch_frame']);
  const queryTool = findTool(['querySelector', 'query_selector', 'query']);

  if (!gotoTool){ throw new Error('No navigation tool exposed by Browser MCP (navigate/goto/open)'); }
  if (!queryTool && !waitTool){ throw new Error('No query tools exposed by Browser MCP'); }

  async function callTool(name, args){
    log('call', name, JSON.stringify(args));
    const res = await client.callTool({ name, arguments: args });
    log('result keys', Object.keys(res));
    return res;
  }

  // 1) Home anchor
  await callTool(gotoTool, { url: 'https://www.1688.com/', waitUntil: 'domcontentloaded' });
  const homeSelectors = anchors.stages.home.selectors;
  let ok = false;
  for (const sel of homeSelectors){
    const tool = waitTool || queryTool;
    const args = waitTool ? { selector: sel, timeout: 15000 } : { selector: sel };
    try { await callTool(tool, args); ok = true; break; } catch { /* try next */ }
  }
  log('home anchor', ok ? 'OK' : 'MISS');

  // 2) Search results anchor (example keyword)
  const kw = '冲锋衣';
  const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(kw)}&n=y`;
  await callTool(gotoTool, { url, waitUntil: 'domcontentloaded' });
  let okSearch = false;
  for (const sel of anchors.stages.searchResults.selectors){
    const tool = waitTool || queryTool;
    const args = waitTool ? { selector: sel, timeout: 20000 } : { selector: sel };
    try { await callTool(tool, args); okSearch = true; break; } catch {}
  }
  log('search anchor', okSearch ? 'OK' : 'MISS');

  // 3) Open a chat link if available (best-effort) so we can check chat anchors
  try {
    const openLinkTool = findTool(['click', 'clickSelector', 'click_selector']);
    if (openLinkTool){
      await callTool(openLinkTool, { selector: "a[href*='air.1688.com/app/']", timeout: 15000 });
    }
  } catch {}

  // 4) Chat target anchor
  const chatFrame = anchors.stages.chatTarget.frame?.urlPattern;
  if (chatFrame && frameTool){
    await callTool(frameTool, { urlPattern: chatFrame });
  }
  let okChatTarget = false;
  for (const sel of anchors.stages.chatTarget.selectors){
    const tool = waitTool || queryTool;
    const args = waitTool ? { selector: sel, timeout: 20000 } : { selector: sel };
    try { await callTool(tool, args); okChatTarget = true; break; } catch {}
  }
  log('chat target anchor', okChatTarget ? 'OK' : 'MISS');

  // 5) Send area anchor
  const sendFrame = anchors.stages.sendArea.frame?.urlPattern;
  if (sendFrame && frameTool){
    await callTool(frameTool, { urlPattern: sendFrame });
  }
  let okSend = false;
  for (const sel of anchors.stages.sendArea.selectors){
    const tool = waitTool || queryTool;
    const args = waitTool ? { selector: sel, timeout: 20000 } : { selector: sel };
    try { await callTool(tool, args); okSend = true; break; } catch {}
  }
  log('send area anchor', okSend ? 'OK' : 'MISS');

  process.exit(0);
}

main().catch(err => { console.error('MCP client error:', err?.message || err); process.exit(1); });

