/**
 * Block: GenerateSmartReply
 *
 * 职责：
 * - 构造 prompt（<note> + <comment>）
 * - 调用 OpenAI-compatible Chat API 生成 <= N 字回复
 *
 * Dev 模式：
 * - 默认返回 mock 回复（避免误触发真实外部请求/成本）
 */

import { buildSmartReplyUserPrompt, mockSmartReply, sanitizeSmartReply } from './helpers/smartReply.js';

export interface GenerateSmartReplyInput {
  note: string;
  comment: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxChars?: number;
  dev?: boolean;
  dryRun?: boolean;
}

export interface GenerateSmartReplyOutput {
  success: boolean;
  reply: string;
  usedMock: boolean;
  error?: string;
}

function resolveBaseUrl(baseUrl: string) {
  const s = String(baseUrl || '').trim();
  if (!s) return '';
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

export async function execute(input: GenerateSmartReplyInput): Promise<GenerateSmartReplyOutput> {
  const maxChars = typeof input.maxChars === 'number' ? input.maxChars : 20;
  const dev = input.dev === true;
  const dryRun = input.dryRun === true;

  const note = String(input.note || '');
  const comment = String(input.comment || '');

  const apiKey = String(input.apiKey || process.env.WEBAUTO_CHAT_API_KEY || '').trim();
  const model = String(input.model || process.env.WEBAUTO_CHAT_MODEL || 'gpt-4o-mini').trim();
  const baseUrl = resolveBaseUrl(String(input.baseUrl || process.env.WEBAUTO_CHAT_BASE_URL || 'https://api.openai.com'));

  if (dryRun || dev || !apiKey || !baseUrl) {
    return { success: true, reply: mockSmartReply(note, comment, maxChars), usedMock: true };
  }

  try {
    const userPrompt = buildSmartReplyUserPrompt({ note, comment, maxChars });
    const systemPrompt =
      '你是一个真实的小红书用户，擅长用自然、简短、拟人的口吻互动。';

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: typeof input.temperature === 'number' ? input.temperature : 0.7,
      max_tokens: 80,
    };

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const msg = (json as any)?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }

    const content =
      (json as any)?.choices?.[0]?.message?.content ??
      (json as any)?.choices?.[0]?.text ??
      '';
    const reply = sanitizeSmartReply(String(content || ''), maxChars);
    if (!reply) throw new Error('empty reply');

    return { success: true, reply, usedMock: false };
  } catch (e: any) {
    return { success: false, reply: '', usedMock: false, error: e?.message || String(e) };
  }
}
