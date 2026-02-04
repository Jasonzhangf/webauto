/**
 * HighlightBlock - 基础高亮 Block
 *
 * 职责：
 * - 封装 container:operation highlight 调用
 * - 支持单个/批量容器高亮
 * - 支持自定义样式和持续时间
 * - 返回 rect/anchor 信息用于验证
 * - 失败时降级（不阻塞主流程）
 */

import { controllerAction } from '../../xiaohongshu/app/src/utils/controllerAction.js';

export interface HighlightBlockInput {
  sessionId: string;
  containerIds: string | string[];
  durationMs?: number;
  style?: string;
  throwOnError?: boolean;
}

export interface HighlightBlockOutput {
  success: boolean;
  highlighted: string[];
  failed: string[];
  anchors: Map<string, any>;
}

export class HighlightBlock {
  constructor(
    private readonly unifiedApiUrl: string,
    private readonly logger: any = console
  ) {}

  async execute(input: HighlightBlockInput): Promise<HighlightBlockOutput> {
    const {
      sessionId,
      containerIds,
      durationMs = 1200,
      style = '2px solid #ffaa00',
      throwOnError = false
    } = input;

    const ids = Array.isArray(containerIds) ? containerIds : [containerIds];
    const highlighted: string[] = [];
    const failed: string[] = [];
    const anchors = new Map<string, any>();

    const results = await Promise.allSettled(
      ids.map((id) => this.highlightOne(sessionId, id, durationMs, style))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const id = ids[i];
      if (result.status === 'fulfilled' && result.value) {
        highlighted.push(id);
        if (result.value.anchor || result.value.rect) anchors.set(id, result.value);
      } else {
        failed.push(id);
      }
    }

    if (throwOnError && highlighted.length === 0) {
      throw new Error(`HighlightBlock: all ${ids.length} container(s) failed to highlight`);
    }

    return {
      success: highlighted.length > 0,
      highlighted,
      failed,
      anchors
    };
  }

  private async highlightOne(
    sessionId: string,
    containerId: string,
    durationMs: number,
    style: string
  ): Promise<any> {
    const response = await controllerAction('container:operation', {
      containerId,
      operationId: 'highlight',
      sessionId,
      config: {
        duration: durationMs,
        style,
        channel: 'highlight-block'
      }
    }, this.unifiedApiUrl);

    return response;
  }
}

export async function highlightContainers(
  unifiedApiUrl: string,
  sessionId: string,
  containerIds: string | string[],
  options: { durationMs?: number; style?: string; throwOnError?: boolean } = {}
): Promise<HighlightBlockOutput> {
  const block = new HighlightBlock(unifiedApiUrl, console);
  return block.execute({ sessionId, containerIds, ...options });
}
