export function nowText() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export function readNumber(input: HTMLInputElement, fallback: number, min = 0) {
  const raw = Number(input.value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.floor(raw));
}

export function toTaskNameFallback(keyword: string) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return keyword ? `${keyword}-${stamp}` : `xhs-task-${stamp}`;
}
