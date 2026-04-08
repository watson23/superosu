// Score, combo, accuracy tracking + rank calculation

import type { Judgment } from './hit-judgment.ts';

export type Rank = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  counts: { 300: number; 100: number; 50: number; 0: number };
  accuracy: number;
}

export class ScoreManager {
  private _score = 0;
  private _combo = 0;
  private _maxCombo = 0;
  private _counts = { 300: 0, 100: 0, 50: 0, 0: 0 };
  private difficultyMultiplier: number;

  constructor(cs: number, od: number, hp: number) {
    // Simplified difficulty multiplier
    this.difficultyMultiplier = Math.round((cs + od + hp) / 6);
  }

  addHit(judgment: Judgment): void {
    this._counts[judgment]++;

    if (judgment === 0) {
      this._combo = 0;
      return;
    }

    this._combo++;
    if (this._combo > this._maxCombo) this._maxCombo = this._combo;

    this._score += Math.round(
      judgment * (1 + (this._combo * this.difficultyMultiplier) / 25)
    );
  }

  get state(): ScoreState {
    return {
      score: this._score,
      combo: this._combo,
      maxCombo: this._maxCombo,
      counts: { ...this._counts },
      accuracy: this.accuracy,
    };
  }

  get accuracy(): number {
    const total =
      this._counts[300] +
      this._counts[100] +
      this._counts[50] +
      this._counts[0];
    if (total === 0) return 1;
    return (
      (this._counts[300] * 300 +
        this._counts[100] * 100 +
        this._counts[50] * 50) /
      (total * 300)
    );
  }

  get rank(): Rank {
    const acc = this.accuracy;
    const total =
      this._counts[300] +
      this._counts[100] +
      this._counts[50] +
      this._counts[0];
    if (total === 0) return 'SS';

    const ratio300 = this._counts[300] / total;
    const ratio50 = this._counts[50] / total;
    const misses = this._counts[0];

    if (acc === 1) return 'SS';
    if (ratio300 > 0.9 && ratio50 < 0.01 && misses === 0) return 'S';
    if ((ratio300 > 0.8 && misses === 0) || ratio300 > 0.9) return 'A';
    if ((ratio300 > 0.7 && misses === 0) || ratio300 > 0.8) return 'B';
    if (ratio300 > 0.6) return 'C';
    return 'D';
  }

  reset(): void {
    this._score = 0;
    this._combo = 0;
    this._maxCombo = 0;
    this._counts = { 300: 0, 100: 0, 50: 0, 0: 0 };
  }
}
