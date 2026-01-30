import { controllerAction, delay } from '../../utils/controllerAction.js';

export type XhsExtractedComment = {
  user_id?: string;
  user_name?: string;
  text?: string;
  timestamp?: string;
  like_status?: string;
};

export async function ensureCommentsOpened(sessionId: string, apiUrl: string): Promise<void> {
  await controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_button',
      operationId: 'highlight',
      sessionId,
      config: { duration: 1800, channel: 'xhs-comments' },
    },
    apiUrl,
  ).catch((): null => null);

  await controllerAction(
    'container:operation',
    { containerId: 'xiaohongshu_detail.comment_button', operationId: 'click', sessionId },
    apiUrl,
  ).catch(() => {});

  await delay(1200);
}

export async function isCommentEnd(sessionId: string, apiUrl: string): Promise<boolean> {
  const end = await controllerAction(
    'container:operation',
    { containerId: 'xiaohongshu_detail.comment_section.end_marker', operationId: 'extract', sessionId },
    apiUrl,
  ).catch((): null => null);

  if (!end || end?.success !== true) return false;
  const extracted = Array.isArray(end?.extracted) ? end.extracted : [];
  return extracted.length > 0;
}

export async function extractVisibleComments(sessionId: string, apiUrl: string, maxItems: number) {
  const res = await controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'extract',
      sessionId,
      config: { max_items: Math.max(1, Math.min(80, Math.floor(maxItems))), visibleOnly: true },
    },
    apiUrl,
  );

  if (!res?.success) return [] as XhsExtractedComment[];
  const extracted = Array.isArray(res?.extracted) ? (res.extracted as XhsExtractedComment[]) : [];
  return extracted;
}

export async function highlightCommentRow(sessionId: string, index: number, apiUrl: string, channel = 'xhs-comment-row') {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section.comment_item',
      operationId: 'highlight',
      sessionId,
      config: {
        index,
        target: 'self',
        style: '6px solid #ff00ff',
        duration: 8000,
        channel,
        visibleOnly: true,
      },
    },
    apiUrl,
  );
}

export async function scrollComments(sessionId: string, apiUrl: string, distance = 650) {
  return controllerAction(
    'container:operation',
    {
      containerId: 'xiaohongshu_detail.comment_section',
      operationId: 'scroll',
      sessionId,
      config: { direction: 'down', distance: Math.max(60, Math.min(800, Math.floor(distance))) },
    },
    apiUrl,
  );
}

