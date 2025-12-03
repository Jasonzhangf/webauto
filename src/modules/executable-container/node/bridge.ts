import type { Page } from 'playwright';
import loader from './loader';
// @ts-ignore - cjs helper
// eslint-disable-next-line @typescript-eslint/no-var-requires
const actionExec = require('./action-executor.cjs');
import { join } from 'path';
import { pathToFileURL } from 'url';
import saveUtil from './save';

// process类型已由@types/node提供

export interface AttachOptions {
  site?: string;
  engine?: any;
  recorder?: any;
}

const inpageBundlePath = 'src/modules/executable-container/inpage/picker.ts'; // for reference only

async function ensureHighlightService(page: Page) {
  const has = await page.evaluate(() => typeof (window as any).__webautoHighlight !== 'undefined').catch(() => false);
  if (!has) {
    // assume highlight service already bundled in the page via other path in current project
    // if not, we could inject transpiled JS of highlight-service when available
  }
}

async function ensurePickerInjected(page: Page) {
  const ok = await page.evaluate(() => typeof (window as any).__webautoPicker !== 'undefined').catch(() => false);
  if (!ok) {
    // In this repo, picker is TypeScript; at runtime it must be bundled/injected.
    // Here we assume caller will preload the compiled picker script; otherwise use page.addScriptTag.
  }
}

async function attach(page: Page, opts: AttachOptions = {}) {
  await ensureHighlightService(page);
  await ensurePickerInjected(page);

  // inject container index of site
  if (opts.site) {
    try {
      const index = await loader.loadIndexForSite(opts.site);
      await page.evaluate((idx: any) => { (window as any).__containerIndex = idx; }, index);
    } catch {}
  }

  // expose event sink
  try {
    await page.exposeFunction('webauto_dispatch', async (evt: any) => {
      try {
        opts.recorder?.record?.('picker_event', { evt });
      } catch {}

      // autorun menu actions via node execution
      if (evt?.type === 'menu:action:selected' && evt?.data?.definition && evt?.data?.key) {
        try {
          await executeOperation(page, evt.data.definition, evt.data.key, { engine: opts.engine, recorder: opts.recorder });
        } catch (e:any) {
          opts.recorder?.record?.('picker_error', { error: e?.message || String(e) });
        }
      }

      // new: actions-system driven
      if (evt?.type === 'picker:event' && evt?.data?.eventKey) {
        const selector = evt?.data?.selector || '';
        try {
          const res = await actionExec.executeEvent(page, opts.engine, opts.site, evt.data.eventKey, selector);
          opts.recorder?.record?.('action_event_result', { key: evt.data.eventKey, selector, res });
        } catch (e:any) {
          opts.recorder?.record?.('action_event_error', { key: evt.data.eventKey, selector, error: e?.message || String(e) });
        }
      }
      if (evt?.type === 'picker:operation' && evt?.data?.opKey) {
        const selector = evt?.data?.selector || '';
        try {
          const res = await actionExec.executeOperation(page, opts.engine, opts.site, evt.data.opKey, selector);
          opts.recorder?.record?.('action_operation_result', { key: evt.data.opKey, selector, res });
        } catch (e:any) {
          opts.recorder?.record?.('action_operation_error', { key: evt.data.opKey, selector, error: e?.message || String(e) });
        }
      }

      // custom textual operation (for later synthesis)
      if (evt?.type === 'picker:operation:custom') {
        try {
          opts.recorder?.record?.('picker_custom_operation', {
            prompt: evt?.data?.prompt || '',
            selector: evt?.data?.selector || '',
            classChoice: evt?.data?.classChoice || '',
            containerTree: evt?.data?.containerTree || []
          });
        } catch {}
      }
    });
  } catch {}
}

async function startPicker(page: Page, options: any = {}) {
  await page.evaluate((opts: any) => { (window as any).__webautoPicker?.start(opts); }, options);
}

async function stopPicker(page: Page) {
  await page.evaluate(() => { (window as any).__webautoPicker?.stop(); });
}

function resolveNodePath(nodeName: string): string | null {
  const map: Record<string, string> = {
    'EventDrivenOptionalClickNode': 'src/core/workflow/nodes/EventDrivenOptionalClickNode.js',
    'ChatComposeNode': 'src/core/workflow/nodes/ChatComposeNode.js',
    'PlaywrightClickNode': 'src/core/workflow/nodes/PlaywrightClickNode.js',
    'JavaScriptExecutionNode': 'src/core/workflow/nodes/JavaScriptExecutionNode.js',
  };
  return map[nodeName] || null;
}

async function loadNodeClass(nodeName: string): Promise<any> {
  const rel = resolveNodePath(nodeName);
  if (!rel) throw new Error(`Unknown node: ${nodeName}`);
  const abs = join(process.cwd(), rel);
  const mod = await import(pathToFileURL(abs).toString());
  return mod?.default || mod;
}

function pickOperation(def: any, opKey: string): { node: string; params: any } | null {
  const ops = def?.runtime?.operations || [];
  const op = ops.find((o: any) => o.key === opKey);
  if (!op) return null;
  if (op.event) {
    const ev = (def?.runtime?.events || []).find((e: any) => e.name === op.event);
    if (ev) return { node: ev.node, params: ev.params || {} };
  }
  if (op.node) return { node: op.node, params: op.params || {} };
  return null;
}

async function executeOperation(page: Page, def: any, opKey: string, opts: { engine?: any; recorder?: any } = {}) {
  // 特殊处理保存容器操作
  if (opKey === 'save-container') {
    try {
      opts.recorder?.record?.('operation_executing', { opKey, node: 'save-container' });
      
      // 确保定义有website属性
      const website = def.website || (opts as any).site || 'unknown';
      
      // 调用saveDefinition函数保存容器
      const filePath = await saveUtil.saveDefinition(def, { 
        site: website,
        fileName: `container_${Date.now()}.json` 
      });
      
      opts.recorder?.record?.('operation_result', { opKey, node: 'save-container', res: { filePath } });
      return { success: true, filePath, message: '容器保存成功' };
    } catch (e:any) {
      opts.recorder?.record?.('operation_error', { opKey, node: 'save-container', error: e?.message || String(e) });
      return { success: false, error: e?.message || String(e) };
    }
  }
  
  // 常规操作处理
  const picked = pickOperation(def, opKey);
  if (!picked) return { success: false, error: 'operation not found' };
  
  try {
    const NodeClass = await loadNodeClass(picked.node);
    const node = new NodeClass();
    const logger = console;
    const context = { page, logger, config: picked.params, engine: opts.engine };
    
    opts.recorder?.record?.('operation_executing', { opKey, node: picked.node });
    const res = await node.execute(context);
    opts.recorder?.record?.('operation_result', { opKey, node: picked.node, res });
    return res;
  } catch (e:any) {
    opts.recorder?.record?.('operation_error', { opKey, node: picked.node, error: e?.message || String(e) });
    return { success: false, error: e?.message || String(e) };
  }
}

export default { attach, startPicker, stopPicker, executeOperation };
