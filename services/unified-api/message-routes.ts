/**
 * 消息总线 HTTP 路由
 * 提供消息总线的 REST API
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { MessageBusService } from '../../libs/operations-framework/src/event-driven/MessageBusService.js';

export function setupMessageRoutes(
  server: any,
  messageBus: MessageBusService
): void {
  const originalRequestListener = server.listeners('request')[0];
  
  server.removeAllListeners('request');
  
  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    
    // 消息总线相关路由
    if (url.pathname.startsWith('/v1/messages')) {
      await handleMessageRoutes(req, res, url, messageBus);
      return;
    }
    
    // 其他路由交给原始处理器
    if (originalRequestListener) {
      originalRequestListener(req, res);
    }
  });
}

async function handleMessageRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  messageBus: MessageBusService
): Promise<void> {
  try {
    // GET /v1/messages/stats - 获取统计信息
    if (req.method === 'GET' && url.pathname === '/v1/messages/stats') {
      const stats = messageBus.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: stats }));
      return;
    }
    
    // GET /v1/messages/history - 获取消息历史
    if (req.method === 'GET' && url.pathname === '/v1/messages/history') {
      const type = url.searchParams.get('type') || undefined;
      const since = url.searchParams.get('since');
      const until = url.searchParams.get('until');
      const limit = url.searchParams.get('limit');
      
      const history = messageBus.getHistory({
        type,
        since: since ? parseInt(since, 10) : undefined,
        until: until ? parseInt(until, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: history, count: history.length }));
      return;
    }
    
    // GET /v1/messages/subscriptions - 获取所有订阅
    if (req.method === 'GET' && url.pathname === '/v1/messages/subscriptions') {
      const subscriptions = messageBus.getSubscriptions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: subscriptions }));
      return;
    }
    
    // POST /v1/messages/publish - 发布消息
    if (req.method === 'POST' && url.pathname === '/v1/messages/publish') {
      const body = await readJsonBody(req);
      const { type, payload, source } = body;
      
      if (!type) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Missing message type' }));
        return;
      }
      
      const messageId = await messageBus.publish(type, payload || {}, source || {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { messageId } }));
      return;
    }
    
    // DELETE /v1/messages/history - 清空历史
    if (req.method === 'DELETE' && url.pathname === '/v1/messages/history') {
      messageBus.clearHistory();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    
    // GET /v1/messages/rules - 获取持久化规则
    if (req.method === 'GET' && url.pathname === '/v1/messages/rules') {
      const rules = messageBus.getPersistRules();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: rules }));
      return;
    }
    
    // PUT /v1/messages/rules - 更新持久化规则
    if (req.method === 'PUT' && url.pathname === '/v1/messages/rules') {
      const body = await readJsonBody(req);
      const { rules } = body;
      
      if (!Array.isArray(rules)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid rules format' }));
        return;
      }
      
      messageBus.setPersistRules(rules);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    
    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Not Found' }));
    
  } catch (err: any) {
    console.error('[message-routes] Error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false, 
      error: err?.message || 'Internal Server Error' 
    }));
  }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}
