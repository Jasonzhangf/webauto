export function safeJsonParse(text, fallback = null) {
  try {
    const parsed = JSON.parse(text ?? 'null');
    return parsed;
  } catch {
    return fallback;
  }
}
