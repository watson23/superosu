// HP drain system: continuous drain + recovery on hits

import type { Judgment } from './hit-judgment.ts';

export class HpDrain {
  private _hp = 1; // 0..1
  private drainRate: number; // HP per second

  constructor(hpDifficulty: number) {
    // Higher HP difficulty = faster drain
    this.drainRate = 0.02 + hpDifficulty * 0.005;
  }

  update(dtSeconds: number): void {
    this._hp = Math.max(0, this._hp - this.drainRate * dtSeconds);
  }

  onHit(judgment: Judgment): void {
    const recovery: Record<Judgment, number> = {
      300: 0.04,
      100: 0.02,
      50: 0.01,
      0: -0.05,
    };
    this._hp = Math.max(0, Math.min(1, this._hp + recovery[judgment]));
  }

  get hp(): number {
    return this._hp;
  }

  get isDead(): boolean {
    return this._hp <= 0;
  }

  reset(): void {
    this._hp = 1;
  }
}
