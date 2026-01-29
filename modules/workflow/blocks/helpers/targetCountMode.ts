export type TargetCountMode = 'absolute' | 'incremental';

export interface ResolveTargetCountInput {
  targetCount: number;
  baseCount: number;
  mode?: TargetCountMode;
}

export interface ResolveTargetCountOutput {
  requested: number;
  targetTotal: number;
  mode: TargetCountMode;
}

export function resolveTargetCount(input: ResolveTargetCountInput): ResolveTargetCountOutput {
  const requested = Number.isFinite(input.targetCount)
    ? Math.max(0, Math.floor(input.targetCount))
    : 0;
  const mode: TargetCountMode = input.mode === 'incremental' ? 'incremental' : 'absolute';
  const targetTotal = mode === 'incremental' ? input.baseCount + requested : requested;
  return { requested, targetTotal, mode };
}
