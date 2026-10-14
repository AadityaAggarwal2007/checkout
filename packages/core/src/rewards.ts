import type { Paise } from './money.js';

/** Reward bar in the cart drawer: milestones by cart value (or item count). */
export interface RewardTier {
  id: string;
  label: string;
  /** Paise for 'value', pieces for 'quantity'. */
  threshold: number;
  kind: 'shipping' | 'gift' | 'discount';
}

export interface RewardProgress {
  /** 0..1 position of the bar. */
  progress: number;
  reached: RewardTier[];
  next?: RewardTier;
  /** Still needed for the next tier (paise or pieces). */
  remaining: number;
  allReached: boolean;
}

export function rewardProgress(tiers: RewardTier[], current: Paise | number): RewardProgress {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  const reached = sorted.filter((t) => current >= t.threshold);
  const next = sorted.find((t) => current < t.threshold);
  const top = sorted.at(-1)?.threshold ?? 0;
  return {
    progress: top > 0 ? Math.min(1, current / top) : 1,
    reached,
    next,
    remaining: next ? next.threshold - current : 0,
    allReached: !next,
  };
}
