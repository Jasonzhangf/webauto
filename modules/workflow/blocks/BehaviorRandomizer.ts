/**
 * BehaviorRandomizer - 行为随机化工具
 *
 * 用于降低自动化痕迹：
 * - 随机延迟
 * - 随机滚动偏移
 * - 随机输入节奏
 */

export interface RandomDelayOptions {
  minMs?: number;
  maxMs?: number;
}

export function randomDelay(options: RandomDelayOptions = {}): Promise<void> {
  const min = options.minMs ?? 300;
  const max = options.maxMs ?? 1200;
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export function randomOffset(base: number, variance: number = 50): number {
  const offset = Math.floor(Math.random() * variance * 2) - variance;
  return base + offset;
}

export async function typeWithDelay(
  text: string,
  onChar: (char: string) => Promise<void>,
  minDelay = 50,
  maxDelay = 200
): Promise<void> {
  for (const char of text) {
    await onChar(char);
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
