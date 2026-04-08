// Results screen: score breakdown after gameplay

import { Container, Graphics, Text, type Application } from 'pixi.js';
import type { Screen } from './screen-manager.ts';
import {
  currentBeatmapSet,
  currentDifficultyIndex,
  lastScoreState,
} from './gameplay.ts';
import { saveScore } from '../storage/beatmap-db.ts';

type ScreenNavigator = (name: string) => void;

const RANK_COLORS: Record<string, number> = {
  SS: 0xffdd00,
  S: 0xffdd00,
  A: 0x66ff66,
  B: 0x66aaff,
  C: 0xaa66ff,
  D: 0xff4444,
};

export class ResultsScreen implements Screen {
  private container!: Container;
  private navigate: ScreenNavigator;

  constructor(navigate: ScreenNavigator) {
    this.navigate = navigate;
  }

  enter(app: Application): void {
    this.container = new Container();
    app.stage.addChild(this.container);

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, app.screen.width, app.screen.height);
    bg.fill({ color: 0x0d0d1a });
    this.container.addChild(bg);

    if (!lastScoreState) {
      this.navigate('song-select');
      return;
    }

    const state = lastScoreState;
    const cx = app.screen.width / 2;

    // Rank grade
    const rankText = new Text({
      text: state.rank,
      style: {
        fontSize: 96,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: RANK_COLORS[state.rank] ?? 0xffffff,
      },
    });
    rankText.anchor.set(0.5);
    rankText.position.set(cx, 80);
    this.container.addChild(rankText);

    // Song title
    if (currentBeatmapSet) {
      const diff = currentBeatmapSet.difficulties[currentDifficultyIndex];
      const titleText = new Text({
        text: `${diff.metadata.artist} - ${diff.metadata.title} [${diff.metadata.version}]`,
        style: {
          fontSize: 16,
          fontFamily: 'Arial',
          fill: 0xaaaaaa,
          wordWrap: true,
          wordWrapWidth: app.screen.width - 40,
          align: 'center',
        },
      });
      titleText.anchor.set(0.5);
      titleText.position.set(cx, 145);
      this.container.addChild(titleText);
    }

    // Score
    const scoreText = new Text({
      text: String(state.score).padStart(8, '0'),
      style: {
        fontSize: 40,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    scoreText.anchor.set(0.5);
    scoreText.position.set(cx, 195);
    this.container.addChild(scoreText);

    // Stats row
    const statsY = 250;
    const stats = [
      { label: 'Accuracy', value: (state.accuracy * 100).toFixed(2) + '%' },
      { label: 'Max Combo', value: state.maxCombo + 'x' },
    ];

    stats.forEach((s, i) => {
      const x = cx + (i - 0.5) * 140;
      const label = new Text({
        text: s.label,
        style: { fontSize: 13, fontFamily: 'Arial', fill: 0x888888 },
      });
      label.anchor.set(0.5);
      label.position.set(x, statsY);
      this.container.addChild(label);

      const val = new Text({
        text: s.value,
        style: {
          fontSize: 22,
          fontFamily: 'Arial',
          fontWeight: 'bold',
          fill: 0xffffff,
        },
      });
      val.anchor.set(0.5);
      val.position.set(x, statsY + 22);
      this.container.addChild(val);
    });

    // Hit breakdown
    const breakdownY = 310;
    const breakdowns = [
      { label: '300', count: state.counts[300], color: 0x66ccff },
      { label: '100', count: state.counts[100], color: 0x88ff66 },
      { label: '50', count: state.counts[50], color: 0xffcc22 },
      { label: 'Miss', count: state.counts[0], color: 0xff4444 },
    ];

    breakdowns.forEach((b, i) => {
      const x = cx + (i - 1.5) * 80;

      const label = new Text({
        text: b.label,
        style: { fontSize: 14, fontFamily: 'Arial', fill: b.color },
      });
      label.anchor.set(0.5);
      label.position.set(x, breakdownY);
      this.container.addChild(label);

      const count = new Text({
        text: String(b.count),
        style: {
          fontSize: 20,
          fontFamily: 'Arial',
          fontWeight: 'bold',
          fill: 0xffffff,
        },
      });
      count.anchor.set(0.5);
      count.position.set(x, breakdownY + 22);
      this.container.addChild(count);
    });

    // Buttons
    const btnY = app.screen.height - 80;

    const retryBtn = this.createButton('Retry', cx - 90, btnY, 0xff66aa);
    retryBtn.on('pointerdown', () => this.navigate('gameplay'));
    this.container.addChild(retryBtn);

    const backBtn = this.createButton('Back', cx + 90, btnY, 0x4466aa);
    backBtn.on('pointerdown', () => this.navigate('song-select'));
    this.container.addChild(backBtn);

    // Save score
    this.saveScore(state);
  }

  private createButton(
    label: string,
    x: number,
    y: number,
    color: number
  ): Container {
    const btn = new Container();
    btn.position.set(x, y);

    const bg = new Graphics();
    bg.roundRect(-60, -20, 120, 40, 8);
    bg.fill({ color });
    btn.addChild(bg);

    const text = new Text({
      text: label,
      style: {
        fontSize: 18,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    text.anchor.set(0.5);
    btn.addChild(text);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    return btn;
  }

  private async saveScore(state: NonNullable<typeof lastScoreState>): Promise<void> {
    if (!currentBeatmapSet) return;
    const diff = currentBeatmapSet.difficulties[currentDifficultyIndex];
    await saveScore({
      beatmapId: currentBeatmapSet.id!,
      version: diff.metadata.version,
      score: state.score,
      accuracy: state.accuracy,
      maxCombo: state.maxCombo,
      rank: state.rank,
      counts: state.counts,
      date: Date.now(),
    });
  }

  exit(app: Application): void {
    app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}
