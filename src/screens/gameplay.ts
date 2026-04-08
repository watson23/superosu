// Gameplay screen: the actual osu! game

import {
  Container,
  Graphics,
  Text,
  Sprite,
  Texture,
  type Application,
} from 'pixi.js';
import type { Screen } from './screen-manager.ts';
import type { Beatmap } from '../core/beatmap-parser.ts';
import { audioEngine } from '../core/audio-engine.ts';
import { inputHandler } from '../core/input-handler.ts';
import { computePlayfieldTransform } from '../rendering/playfield.ts';
import { generateSkinTextures } from '../rendering/skin.ts';
import { HitObjectManager } from '../gameplay/hit-objects.ts';
import { ScoreManager } from '../gameplay/score-manager.ts';
import { HpDrain } from '../gameplay/hp-drain.ts';
import type { Judgment } from '../gameplay/hit-judgment.ts';
import type { StoredBeatmapSet } from '../storage/beatmap-db.ts';

// Global state for passing data between screens
export let currentBeatmapSet: StoredBeatmapSet | null = null;
export let currentDifficultyIndex = 0;
export let lastScoreState: {
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  counts: { 300: number; 100: number; 50: number; 0: number };
} | null = null;

export function setCurrentBeatmap(set: StoredBeatmapSet, diffIdx: number): void {
  currentBeatmapSet = set;
  currentDifficultyIndex = diffIdx;
}

type ScreenNavigator = (name: string) => void;

export class GameplayScreen implements Screen {
  private app!: Application;
  private container!: Container;
  private hitObjectManager!: HitObjectManager;
  private scoreManager!: ScoreManager;
  private hpDrain!: HpDrain;
  private beatmap!: Beatmap;
  private navigate!: ScreenNavigator;

  // HUD elements
  private scoreText!: Text;
  private comboText!: Text;
  private accuracyText!: Text;
  private hpBar!: Graphics;

  private running = false;
  private lastTime = 0;
  private userOffsetMs = 0;
  private paused = false;
  private pauseOverlay: Container | null = null;
  private backgroundSprite: Sprite | null = null;

  constructor(navigate: ScreenNavigator) {
    this.navigate = navigate;
  }

  enter(app: Application): void {
    this.app = app;
    this.container = new Container();
    app.stage.addChild(this.container);

    if (!currentBeatmapSet) {
      this.navigate('song-select');
      return;
    }

    this.beatmap = currentBeatmapSet.difficulties[currentDifficultyIndex];
    this.userOffsetMs = parseInt(
      localStorage.getItem('superosu_offset') ?? '0'
    );

    this.setupBackground(currentBeatmapSet.backgroundBlob);
    this.setupPlayfield();
    this.setupHUD();
    this.startGame();
  }

  private async setupBackground(blob: Blob | null): Promise<void> {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const bg = new Sprite(Texture.from(url));
    bg.width = this.app.screen.width;
    bg.height = this.app.screen.height;
    bg.alpha =
      1 -
      parseInt(localStorage.getItem('superosu_bg_dim') ?? '70') / 100;
    bg.zIndex = -1000;
    this.container.addChild(bg);
    this.backgroundSprite = bg;
  }

  private setupPlayfield(): void {
    const transform = computePlayfieldTransform(
      this.app.screen.width,
      this.app.screen.height
    );

    inputHandler.setTransform(transform);

    const skin = generateSkinTextures(this.app);

    this.hitObjectManager = new HitObjectManager();
    this.scoreManager = new ScoreManager(
      this.beatmap.difficulty.cs,
      this.beatmap.difficulty.od,
      this.beatmap.difficulty.hp
    );
    this.hpDrain = new HpDrain(this.beatmap.difficulty.hp);

    this.hitObjectManager.init(
      this.beatmap.difficulty,
      skin,
      transform,
      this.beatmap.hitObjects,
      (judgment: Judgment) => {
        this.scoreManager.addHit(judgment);
        this.hpDrain.onHit(judgment);
      }
    );

    this.container.addChild(this.hitObjectManager.getContainer());

    // Playfield border (subtle)
    const border = new Graphics();
    border.rect(
      transform.offsetX,
      transform.offsetY,
      transform.width,
      transform.height
    );
    border.stroke({ color: 0x333333, width: 1 });
    border.zIndex = -500;
    this.container.addChild(border);
  }

  private setupHUD(): void {
    this.scoreText = new Text({
      text: '00000000',
      style: {
        fontSize: 28,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
        align: 'right',
      },
    });
    this.scoreText.anchor.set(1, 0);
    this.scoreText.position.set(this.app.screen.width - 10, 40);
    this.scoreText.zIndex = 10000;
    this.container.addChild(this.scoreText);

    this.accuracyText = new Text({
      text: '100.00%',
      style: {
        fontSize: 18,
        fontFamily: 'Arial',
        fill: 0xcccccc,
        align: 'right',
      },
    });
    this.accuracyText.anchor.set(1, 0);
    this.accuracyText.position.set(this.app.screen.width - 10, 72);
    this.accuracyText.zIndex = 10000;
    this.container.addChild(this.accuracyText);

    this.comboText = new Text({
      text: '',
      style: {
        fontSize: 40,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
        align: 'center',
      },
    });
    this.comboText.anchor.set(0.5, 1);
    this.comboText.position.set(
      this.app.screen.width / 2,
      this.app.screen.height - 20
    );
    this.comboText.zIndex = 10000;
    this.container.addChild(this.comboText);

    // HP bar
    this.hpBar = new Graphics();
    this.hpBar.zIndex = 10000;
    this.container.addChild(this.hpBar);

    // Pause button
    const pauseBtn = new Text({
      text: '⏸',
      style: { fontSize: 32, fill: 0xffffff },
    });
    pauseBtn.position.set(10, 5);
    pauseBtn.zIndex = 10001;
    pauseBtn.eventMode = 'static';
    pauseBtn.cursor = 'pointer';
    pauseBtn.on('pointerdown', (e) => {
      e.stopPropagation();
      this.togglePause();
    });
    this.container.addChild(pauseBtn);

    this.container.sortableChildren = true;
  }

  private async startGame(): Promise<void> {
    if (!currentBeatmapSet) return;

    await audioEngine.init();
    await audioEngine.loadAudio(currentBeatmapSet.audioData);

    // Input handling
    inputHandler.clearCallbacks();
    inputHandler.onTap((tap) => {
      if (this.paused) return;
      const songTime = audioEngine.getSongPosition(this.userOffsetMs);
      this.hitObjectManager.handleTap(tap.x, tap.y, songTime);
    });

    // Start audio
    const firstObjectTime = this.beatmap.hitObjects[0]?.time ?? 0;
    const startOffset = Math.max(0, firstObjectTime - 2000);
    audioEngine.play(startOffset);

    this.running = true;
    this.lastTime = performance.now();
  }

  update(_dt: number): void {
    if (!this.running || this.paused) return;

    const now = performance.now();
    const dtSeconds = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const songTime = audioEngine.getSongPosition(this.userOffsetMs);

    // Update game systems
    this.hitObjectManager.update(songTime);
    this.hpDrain.update(dtSeconds);

    // Update spinner input tracking
    for (const [, pos] of inputHandler.getActivePointers()) {
      this.hitObjectManager.updateSpinnerInput(pos.x, pos.y, songTime);
    }

    // Update HUD
    const state = this.scoreManager.state;
    this.scoreText.text = String(state.score).padStart(8, '0');
    this.accuracyText.text = (state.accuracy * 100).toFixed(2) + '%';
    this.comboText.text = state.combo > 0 ? `${state.combo}x` : '';

    // HP bar
    this.hpBar.clear();
    const barWidth = this.app.screen.width - 60;
    this.hpBar.rect(50, 8, barWidth, 8);
    this.hpBar.fill({ color: 0x333333 });
    this.hpBar.rect(50, 8, barWidth * this.hpDrain.hp, 8);
    this.hpBar.fill({ color: this.hpDrain.hp > 0.3 ? 0x66ff66 : 0xff4444 });

    // Check for death
    if (this.hpDrain.isDead) {
      this.onFail();
    }

    // Check for song end
    if (!audioEngine.playing && songTime > 0) {
      this.onComplete();
    }
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      audioEngine.pause();
      this.showPauseOverlay();
    } else {
      audioEngine.resume();
      this.hidePauseOverlay();
      this.lastTime = performance.now();
    }
  }

  private showPauseOverlay(): void {
    this.pauseOverlay = new Container();
    this.pauseOverlay.zIndex = 20000;

    const bg = new Graphics();
    bg.rect(0, 0, this.app.screen.width, this.app.screen.height);
    bg.fill({ color: 0x000000, alpha: 0.7 });
    this.pauseOverlay.addChild(bg);

    const pauseText = new Text({
      text: 'PAUSED',
      style: {
        fontSize: 48,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    pauseText.anchor.set(0.5);
    pauseText.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2 - 60
    );
    this.pauseOverlay.addChild(pauseText);

    const makeButton = (label: string, y: number, cb: () => void) => {
      const btn = new Text({
        text: label,
        style: {
          fontSize: 28,
          fontFamily: 'Arial',
          fill: 0x66ccff,
        },
      });
      btn.anchor.set(0.5);
      btn.position.set(this.app.screen.width / 2, y);
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      btn.on('pointerdown', cb);
      return btn;
    };

    this.pauseOverlay.addChild(
      makeButton('Resume', this.app.screen.height / 2, () =>
        this.togglePause()
      )
    );
    this.pauseOverlay.addChild(
      makeButton('Retry', this.app.screen.height / 2 + 50, () => {
        this.cleanup();
        this.enter(this.app);
      })
    );
    this.pauseOverlay.addChild(
      makeButton('Quit', this.app.screen.height / 2 + 100, () => {
        this.cleanup();
        this.navigate('song-select');
      })
    );

    this.container.addChild(this.pauseOverlay);
  }

  private hidePauseOverlay(): void {
    if (this.pauseOverlay) {
      this.container.removeChild(this.pauseOverlay);
      this.pauseOverlay.destroy({ children: true });
      this.pauseOverlay = null;
    }
  }

  private onFail(): void {
    this.running = false;
    audioEngine.stop();
    // Just restart for now — could show fail screen
    this.saveAndShowResults();
  }

  private onComplete(): void {
    this.running = false;
    this.saveAndShowResults();
  }

  private saveAndShowResults(): void {
    const state = this.scoreManager.state;
    lastScoreState = {
      score: state.score,
      accuracy: state.accuracy,
      maxCombo: state.maxCombo,
      rank: this.scoreManager.rank,
      counts: state.counts,
    };
    this.navigate('results');
  }

  private cleanup(): void {
    this.running = false;
    audioEngine.stop();
    inputHandler.clearCallbacks();
    this.hitObjectManager?.destroy();
    if (this.backgroundSprite) {
      URL.revokeObjectURL(
        (this.backgroundSprite.texture.source as unknown as { src: string })
          .src ?? ''
      );
    }
  }

  exit(app: Application): void {
    this.cleanup();
    app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}
