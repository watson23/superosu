// Hit timing judgment: 300/100/50/miss based on OD-derived windows

import type { BeatmapDifficulty } from '../core/beatmap-parser.ts';

export type Judgment = 300 | 100 | 50 | 0; // 0 = miss

export function judge(
  timeDiffMs: number,
  difficulty: BeatmapDifficulty
): Judgment {
  const abs = Math.abs(timeDiffMs);
  if (abs <= difficulty.hitWindow300) return 300;
  if (abs <= difficulty.hitWindow100) return 100;
  if (abs <= difficulty.hitWindow50) return 50;
  return 0;
}

export const JUDGMENT_COLORS: Record<Judgment, number> = {
  300: 0x66ccff, // blue
  100: 0x88ff66, // green
  50: 0xffcc22, // yellow
  0: 0xff4444, // red
};
