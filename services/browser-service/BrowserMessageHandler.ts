import { ElementRegistry } from './ElementRegistry.js';
import { RemoteMessageBusClient } from '../../libs/operations-framework/src/event-driven/RemoteMessageBusClient.js';
import { SessionManager } from './SessionManager.js';
import {
  CMD_BROWSER_DOM_QUERY,
  CMD_BROWSER_DOM_ACTION,
  CMD_BROWSER_PAGE_SCROLL,
  CMD_BROWSER_PAGE_NAVIGATE,
  CMD_BROWSER_SNAPSHOT,
  CMD_BROWSER_EVALUATE,
  RES_BROWSER_DOM_QUERY,
  RES_BROWSER_DOM_ACTION,
  RES_BROWSER_PAGE_SCROLL,
  RES_BROWSER_PAGE_NAVIGATE,
  RES_BROWSER_SNAPSHOT,
  RES_BROWSER_EVALUATE,
  MSG_BROWSER_SERVICE_READY
} from '../../libs/operations-framework/src/event-driven/MessageConstants.js';

/**
 * Browser Message Handler
 * 订阅 CMD_BROWSER_* 消息并通过 SessionManager 执行浏览器操作
 * 返回 RES_BROWSER_* 响应消息
 */
export class BrowserMessageHandler {
  private elementRegistry: ElementRegistry;
  private messageBus: RemoteMessageBusClient;
  private sessionManager: SessionManager;

  constructor(messageBus: RemoteMessageBusClient, sessionManager: SessionManager) {
    this.messageBus = messageBus;
    this.sessionManager = sessionManager;
    this.elementRegistry = new ElementRegistry();
  }

  public async start(): Promise<void> {
    // 订阅所有浏览器命令
    this.messageBus.subscribe('CMD_BROWSER_*', async (message) => {
      await this.handleCommand(message);
    });

    // 发布服务就绪消息
    await this.messageBus.publish(MSG_BROWSER_SERVICE_READY, {
      status: 'ready',
      timestamp: Date.now()
    }, { component: 'BrowserService' });

    console.log('[BrowserMessageHandler] Started and subscribed to CMD_BROWSER_*');
  }

  private async handleCommand(message: any): Promise<void> {
    const { type, payload } = message;
    const requestId = payload?.requestId;

    if (!requestId) {
      console.warn('[BrowserMessageHandler] Message without requestId:', type);
      return;
    }

    console.log(`[BrowserMessageHandler] Handling ${type} (requestId: ${requestId})`);

    try {
      switch (type) {
        case CMD_BROWSER_DOM_QUERY:
          await this.handleDomQuery(requestId, payload);
          break;
        case CMD_BROWSER_DOM_ACTION:
          await this.handleDomAction(requestId, payload);
          break;
        case CMD_BROWSER_PAGE_SCROLL:
          await this.handlePageScroll(requestId, payload);
          break;
        case CMD_BROWSER_PAGE_NAVIGATE:
          await this.handlePageNavigate(requestId, payload);
          break;
        case CMD_BROWSER_SNAPSHOT:
          await this.handleSnapshot(requestId, payload);
          break;
        case CMD_BROWSER_EVALUATE:
          await this.handleEvaluate(requestId, payload);
          break;
        default:
          console.warn(`[BrowserMessageHandler] Unknown command: ${type}`);
          await this.sendError(type.replace('CMD_', 'RES_'), requestId, 'Unknown command');
      }
    } catch (err: any) {
      console.error(`[BrowserMessageHandler] Error handling ${type}:`, err);
      await this.sendError(type.replace('CMD_', 'RES_'), requestId, err.message || String(err));
    }
  }

  private async handleDomQuery(requestId: string, payload: any): Promise<void> {
    const { selector, rootElementId, sessionId } = payload;
    const profileId = sessionId || 'default';
    
    const session = this.sessionManager.getSession(profileId);
    if (!session) {
      await this.sendError(RES_BROWSER_DOM_QUERY, requestId, `Session ${profileId} not found`);
      return;
    }

    try {
      let rootHandle: any;
      
      // 如果指定了 rootElementId，从注册表获取
      if (rootElementId) {
        rootHandle = this.elementRegistry.get(rootElementId);
        if (!rootHandle) {
          throw new Error(`Root element ${rootElementId} not found or expired`);
        }
      } else {
        // 否则使用 page
        rootHandle = await session.ensurePage();
      }
      
      // 查询 DOM 元素
      const elements = await rootHandle.$(selector);
      
      // 注册并返回 ID
      const elementIds = elements.map((el: any) => this.elementRegistry.register(el, profileId));

      await this.messageBus.publish(RES_BROWSER_DOM_QUERY, {
        requestId,
        success: true,
        data: elementIds
      }, { component: 'BrowserService' });
    } catch (err: any) {
      await this.sendError(RES_BROWSER_DOM_QUERY, requestId, err.message);
    }
  }

  private async handleDomAction(requestId: string, payload: any): Promise<void> {
    const { elementId, action, params, sessionId } = payload;
    const profileId = sessionId || 'default';
    
    const session = this.sessionManager.getSession(profileId);
    if (!session) {
      await this.sendError(RES_BROWSER_DOM_ACTION, requestId, `Session ${profileId} not found`);
      return;
    }

    try {
      // 优先从注册表获取元素
      let elementHandle = elementId ? this.elementRegistry.get(elementId) : null;
      let page;

      // 如果找不到 handle，尝试回退到 page + selector 模式 (为了兼容性)
      if (!elementHandle) {
        page = await session.ensurePage();
        if (params?.selector) {
           elementHandle = await page.$(params.selector);
        }
      }

      if (!elementHandle && !page) {
         // 甚至没有 page (不太可能，除非 session 刚建立)
         page = await session.ensurePage();
      }

      // 如果有 handle，直接操作 handle
      if (elementHandle) {
        let resultData: any = null;
        switch (action) {
          case 'click':
            await elementHandle.click();
            break;
          case 'fill':
          case 'input':
            await elementHandle.fill(params?.value || '');
            break;
          case 'focus':
            await elementHandle.focus();
            break;
          case 'extract':
            if (params?.attribute) {
              resultData = await elementHandle.getAttribute(params.attribute);
            } else {
              resultData = await elementHandle.textContent();
            }
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        
        await this.messageBus.publish(RES_BROWSER_DOM_ACTION, {
          requestId,
          success: true,
          data: resultData
        }, { component: 'BrowserService' });
        
        return;
      }

      // 回退到 Page 级操作 (针对没有 elementId 的情况)
      // 这部分保留旧逻辑，或者是对视口级操作(scroll)的支持
      page = await session.ensurePage();
      const selector = params?.selector;
      
      if (!selector) {
         throw new Error(`Element ${elementId} not found and no selector provided`);
      }

      let resultData: any = null;
      switch (action) {
        case 'click':
          await page.click(selector);
          break;
        case 'fill':
        case 'input':
          await page.fill(selector, params?.value || '');
          break;
        case 'focus':
          await page.focus(selector);
          break;
        case 'extract':
          if (params?.attribute) {
            resultData = await page.getAttribute(selector, params.attribute);
          } else {
            resultData = await page.textContent(selector);
          }
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      await this.messageBus.publish(RES_BROWSER_DOM_ACTION, {
        requestId,
        success: true,
        data: resultData
      }, { component: 'BrowserService' });

    } catch (err: any) {
      await this.sendError(RES_BROWSER_DOM_ACTION, requestId, err.message);
    }
  }

  private async handlePageScroll(requestId: string, payload: any): Promise<void> {
    const { x, y, sessionId } = payload;
    const profileId = sessionId || 'default';
    
    const session = this.sessionManager.getSession(profileId);
    if (!session) {
      await this.sendError(RES_BROWSER_PAGE_SCROLL, requestId, `Session ${profileId} not found`);
      return;
    }

    try {
      const page = await session.ensurePage();
      
      // 执行滚动
      await page.evaluate((pos) => {
        window.scrollTo(pos.x, pos.y);
      }, { x: x || 0, y: y || 0 });

      await this.messageBus.publish(RES_BROWSER_PAGE_SCROLL, {
        requestId,
        success: true,
        data: { x, y, scrolled: true }
      }, { component: 'BrowserService' });
    } catch (err: any) {
      await this.sendError(RES_BROWSER_PAGE_SCROLL, requestId, err.message);
    }
  }

  private async handlePageNavigate(requestId: string, payload: any): Promise<void> {
    const { url, sessionId } = payload;
    const profileId = sessionId || 'default';
    
    const session = this.sessionManager.getSession(profileId);
    if (!session) {
      await this.sendError(RES_BROWSER_PAGE_NAVIGATE, requestId, `Session ${profileId} not found`);
      return;
    }

    try {
      await session.goto(url);

      await this.messageBus.publish(RES_BROWSER_PAGE_NAVIGATE, {
        requestId,
        success: true,
        data: { url, loaded: true }
      }, { component: 'BrowserService' });
    } catch (err: any) {
      await this.sendError(RES_BROWSER_PAGE_NAVIGATE, requestId, err.message);
    }
  }

  private async handleSnapshot(requestId: string, payload: any): Promise<void> {
    const { fullPage, sessionId } = payload;
    const profileId = sessionId || 'default';
    
    const session = this.sessionManager.getSession(profileId);
    if (!session) {
      await this.sendError(RES_BROWSER_SNAPSHOT, requestId, `Session ${profileId} not found`);
      return;
    }

    try {
      const buffer = await session.screenshot(!!fullPage);
      const base64 = buffer.toString('base64');

      await this.messageBus.publish(RES_BROWSER_SNAPSHOT, {
        requestId,
        success: true,
        data: base64
      }, { component: 'BrowserService' });
    } catch (err: any) {
      await this.sendError(RES_BROWSER_SNAPSHOT, requestId, err.message);
    }
  }

  private async handleEvaluate(requestId: string, payload: any): Promise<void> {
    const { script, sessionId } = payload;
    const profileId = sessionId || 'default';
    
    const session = this.sessionManager.getSession(profileId);
    if (!session) {
      await this.sendError(RES_BROWSER_EVALUATE, requestId, `Session ${profileId} not found`);
      return;
    }

    try {
      const result = await session.evaluate(script);

      await this.messageBus.publish(RES_BROWSER_EVALUATE, {
        requestId,
        success: true,
        data: { result }
      }, { component: 'BrowserService' });
    } catch (err: any) {
      await this.sendError(RES_BROWSER_EVALUATE, requestId, err.message);
    }
  }

  private async sendError(responseType: string, requestId: string, error: string): Promise<void> {
    await this.messageBus.publish(responseType, {
      requestId,
      success: false,
      error
    }, { component: 'BrowserService' });
  }
}
