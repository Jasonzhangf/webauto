export interface SmartReplyPromptInput {
  note: string;
  comment: string;
  maxChars: number;
}

function normalizeText(s: string) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

export function buildSmartReplyUserPrompt(input: SmartReplyPromptInput) {
  const note = normalizeText(input.note).slice(0, 1200);
  const comment = normalizeText(input.comment).slice(0, 600);

  return [
    `<note>${note}</note>`,
    `<comment>${comment}</comment>`,
    `请根据帖子内容与当前评论，写一句拟人的中文回复（不超过 ${input.maxChars} 字）。`,
    '要求：口吻自然、简短、有一点点人情味；不要营销、不要引导关注、不要带链接；不要复述原文；不要加引号；不要换行。',
  ].join('\n');
}

export function sanitizeSmartReply(raw: string, maxChars: number) {
  let s = normalizeText(raw);
  // 常见模型输出清理
  s = s.replace(/^["“”]+|["“”]+$/g, '');
  s = s.replace(/^(回复|答复|回答)[:：]\s*/g, '');
  s = normalizeText(s);

  const chars = Array.from(s);
  const limit = Math.max(1, Math.min(60, Math.floor(maxChars)));
  if (chars.length > limit) {
    s = chars.slice(0, limit).join('');
  }
  return s;
}

export function mockSmartReply(note: string, comment: string, maxChars: number) {
  const c = normalizeText(comment);
  const templates = [
    '哈哈确实有点像～',
    '我也觉得很实用～',
    '这个点说得太准了',
    '懂你，我也遇到过',
    '可以的，我去试试',
    '谢谢提醒，学到了',
  ];
  const pick = templates[Math.abs(c.length + normalizeText(note).length) % templates.length] || '哈哈确实～';
  return sanitizeSmartReply(pick, maxChars);
}

