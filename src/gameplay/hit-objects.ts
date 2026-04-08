// Hit object rendering and state management for gameplay

import {
  Container,
  Sprite,
  Graphics,
  Text,
} from 'pixi.js';
import type {
  HitCircle,
  Slider,
  Spinner,
  HitObject,
  BeatmapDifficulty,
} from '../core/beatmap-parser.ts';
import type { SkinTextures } from '../rendering/skin.ts';
import type { PlayfieldTransform } from '../rendering/playfield.ts';
import { computeSliderPath, getPositionAlongPath } from './slider-path.ts';
import { judge, type Judgment, JUDGMENT_COLORS } from './hit-judgment.ts';

export type HitObjectState = 'waiting' | 'active' | 'hit' | 'missed';

interface ActiveHitObject {
  data: HitObject;
  container: Container;
  state: HitObjectState;
  comboNumber: number;
  comboColor: number;
}

interface ActiveSlider extends ActiveHitObject {
  data: Slider;
  path: { x: number; y: number }[];
  bodyGraphics: Graphics;
  ball: Sprite;
  headHit: boolean;
  tracking: boolean;
  ticksHit: number;
  totalTicks: number;
}

interface ActiveSpinner extends ActiveHitObject {
  data: Spinner;
  totalRotation: number;
  lastAngle: number | null;
  requiredRotations: number;
  progress: Graphics;
}

const COMBO_COLORS = [0xff66aa, 0x66aaff, 0x66ff66, 0xffaa33];

export class HitObjectManager {
  private container: Container;
  private objects: ActiveHitObject[] = [];
  private judgedObjects: {
    container: Container;
    time: number;
  }[] = [];
  private difficulty!: BeatmapDifficulty;
  private skin!: SkinTextures;
  private transform!: PlayfieldTransform;
  private allHitObjects: HitObject[] = [];
  private nextIndex = 0;
  private comboCounter = 0;
  private comboColorIndex = 0;
  private onJudgment: ((j: Judgment, obj: HitObject) => void) | null = null;

  constructor() {
    this.container = new Container();
    this.container.sortableChildren = true;
  }

  init(
    difficulty: BeatmapDifficulty,
    skin: SkinTextures,
    transform: PlayfieldTransform,
    hitObjects: HitObject[],
    onJudgment: (j: Judgment, obj: HitObject) => void
  ): void {
    this.difficulty = difficulty;
    this.skin = skin;
    this.transform = transform;
    this.allHitObjects = hitObjects;
    this.onJudgment = onJudgment;
    this.nextIndex = 0;
    this.comboCounter = 0;
    this.comboColorIndex = 0;
    this.objects = [];
    this.judgedObjects = [];
    this.container.removeChildren();
  }

  getContainer(): Container {
    return this.container;
  }

  update(songTimeMs: number): void {
    const approachTime = this.difficulty.approachTime;

    // Spawn new objects that are within approach window
    while (this.nextIndex < this.allHitObjects.length) {
      const obj = this.allHitObjects[this.nextIndex];
      if (obj.time - approachTime > songTimeMs) break;

      if (obj.newCombo) {
        this.comboCounter = 0;
        this.comboColorIndex =
          (this.comboColorIndex + 1) % COMBO_COLORS.length;
      }
      this.comboCounter++;

      this.spawnObject(obj, this.comboCounter, COMBO_COLORS[this.comboColorIndex]);
      this.nextIndex++;
    }

    // Update active objects
    for (const obj of this.objects) {
      if (obj.state !== 'waiting' && obj.state !== 'active') continue;
      obj.state = 'active';
      this.updateObject(obj, songTimeMs);
    }

    // Auto-miss circles that passed their window
    for (const obj of this.objects) {
      if (obj.state !== 'active') continue;

      if (obj.data.type === 'circle') {
        if (songTimeMs > obj.data.time + this.difficulty.hitWindow50) {
          this.judgeObject(obj, 0, songTimeMs);
        }
      } else if (obj.data.type === 'slider') {
        const slider = obj as ActiveSlider;
        if (songTimeMs > slider.data.time + slider.data.duration) {
          this.finishSlider(slider, songTimeMs);
        }
      } else if (obj.data.type === 'spinner') {
        const spinner = obj as ActiveSpinner;
        if (songTimeMs > spinner.data.endTime) {
          this.finishSpinner(spinner, songTimeMs);
        }
      }
    }

    // Clean up judged objects (fade out)
    this.judgedObjects = this.judgedObjects.filter((jo) => {
      const age = songTimeMs - jo.time;
      if (age > 400) {
        this.container.removeChild(jo.container);
        jo.container.destroy({ children: true });
        return false;
      }
      jo.container.alpha = 1 - age / 400;
      return true;
    });

    // Remove processed objects
    this.objects = this.objects.filter(
      (o) => o.state === 'waiting' || o.state === 'active'
    );
  }

  handleTap(x: number, y: number, timeMs: number): boolean {
    const radius = this.difficulty.circleRadius;

    // Find closest active circle/slider head within radius
    let closest: ActiveHitObject | null = null;
    let closestDist = Infinity;

    for (const obj of this.objects) {
      if (obj.state !== 'active') continue;

      if (obj.data.type === 'circle') {
        const dx = x - obj.data.x;
        const dy = y - obj.data.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius && dist < closestDist) {
          // Check if within timing window
          const timeDiff = Math.abs(timeMs - obj.data.time);
          if (timeDiff <= this.difficulty.hitWindow50) {
            closest = obj;
            closestDist = dist;
          }
        }
      } else if (obj.data.type === 'slider') {
        const slider = obj as ActiveSlider;
        if (slider.headHit) continue;
        const dx = x - slider.data.x;
        const dy = y - slider.data.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius && dist < closestDist) {
          const timeDiff = Math.abs(timeMs - slider.data.time);
          if (timeDiff <= this.difficulty.hitWindow50) {
            closest = obj;
            closestDist = dist;
          }
        }
      }
    }

    if (closest) {
      if (closest.data.type === 'circle') {
        const timeDiff = timeMs - closest.data.time;
        const judgment = judge(timeDiff, this.difficulty);
        this.judgeObject(closest, judgment, timeMs);
      } else if (closest.data.type === 'slider') {
        const slider = closest as ActiveSlider;
        slider.headHit = true;
        slider.tracking = true;
      }
      return true;
    }

    return false;
  }

  updateSpinnerInput(
    x: number,
    y: number,
    _timeMs: number
  ): void {
    for (const obj of this.objects) {
      if (obj.state !== 'active' || obj.data.type !== 'spinner') continue;
      const spinner = obj as ActiveSpinner;

      const angle = Math.atan2(y - 192, x - 256);
      if (spinner.lastAngle !== null) {
        let delta = angle - spinner.lastAngle;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        spinner.totalRotation += Math.abs(delta);
      }
      spinner.lastAngle = angle;
    }
  }

  private spawnObject(
    data: HitObject,
    comboNumber: number,
    comboColor: number
  ): void {
    if (data.type === 'circle') {
      this.spawnCircle(data, comboNumber, comboColor);
    } else if (data.type === 'slider') {
      this.spawnSlider(data, comboNumber, comboColor);
    } else if (data.type === 'spinner') {
      this.spawnSpinner(data, comboNumber, comboColor);
    }
  }

  private spawnCircle(
    data: HitCircle,
    comboNumber: number,
    comboColor: number
  ): void {
    const cont = new Container();
    const scale = this.transform.scale;
    const radius = this.difficulty.circleRadius;
    const size = (radius * 2 * scale) / 128; // 128 = texture size

    // Hit circle
    const circle = new Sprite(this.skin.hitCircle);
    circle.anchor.set(0.5);
    circle.width = radius * 2 * scale;
    circle.height = radius * 2 * scale;
    circle.tint = comboColor;
    cont.addChild(circle);

    // Overlay
    const overlay = new Sprite(this.skin.hitCircleOverlay);
    overlay.anchor.set(0.5);
    overlay.width = radius * 2 * scale;
    overlay.height = radius * 2 * scale;
    cont.addChild(overlay);

    // Combo number
    const numText = new Text({
      text: String(comboNumber),
      style: {
        fontSize: Math.round(24 * size),
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
        align: 'center',
      },
    });
    numText.anchor.set(0.5);
    cont.addChild(numText);

    // Approach circle
    const approach = new Sprite(this.skin.approachCircle);
    approach.anchor.set(0.5);
    approach.tint = comboColor;
    approach.label = 'approach';
    cont.addChild(approach);

    const screenX =
      data.x * this.transform.scale + this.transform.offsetX;
    const screenY =
      data.y * this.transform.scale + this.transform.offsetY;
    cont.position.set(screenX, screenY);
    cont.zIndex = -data.time; // earlier objects on top

    this.container.addChild(cont);
    this.objects.push({
      data,
      container: cont,
      state: 'waiting',
      comboNumber,
      comboColor,
    });
  }

  private spawnSlider(
    data: Slider,
    comboNumber: number,
    comboColor: number
  ): void {
    const cont = new Container();
    const scale = this.transform.scale;
    const radius = this.difficulty.circleRadius;

    // Compute path
    const path = computeSliderPath(
      data.x,
      data.y,
      data.curveType,
      data.curvePoints,
      data.length
    );

    // Draw slider body
    const bodyGraphics = new Graphics();
    bodyGraphics.moveTo(
      path[0].x * scale + this.transform.offsetX,
      path[0].y * scale + this.transform.offsetY
    );
    for (let i = 1; i < path.length; i++) {
      bodyGraphics.lineTo(
        path[i].x * scale + this.transform.offsetX,
        path[i].y * scale + this.transform.offsetY
      );
    }
    bodyGraphics.stroke({
      color: comboColor,
      width: radius * 2 * scale,
      alpha: 0.6,
      cap: 'round',
      join: 'round',
    });

    // Slider body border
    const borderGraphics = new Graphics();
    borderGraphics.moveTo(
      path[0].x * scale + this.transform.offsetX,
      path[0].y * scale + this.transform.offsetY
    );
    for (let i = 1; i < path.length; i++) {
      borderGraphics.lineTo(
        path[i].x * scale + this.transform.offsetX,
        path[i].y * scale + this.transform.offsetY
      );
    }
    borderGraphics.stroke({
      color: 0xffffff,
      width: radius * 2 * scale + 4,
      alpha: 0.3,
      cap: 'round',
      join: 'round',
    });

    cont.addChild(borderGraphics);
    cont.addChild(bodyGraphics);

    // Head circle (same as hit circle)
    const headContainer = new Container();
    const headCircle = new Sprite(this.skin.hitCircle);
    headCircle.anchor.set(0.5);
    headCircle.width = radius * 2 * scale;
    headCircle.height = radius * 2 * scale;
    headCircle.tint = comboColor;
    headContainer.addChild(headCircle);

    const numText = new Text({
      text: String(comboNumber),
      style: {
        fontSize: Math.round(24 * (radius * 2 * scale) / 128),
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
        align: 'center',
      },
    });
    numText.anchor.set(0.5);
    headContainer.addChild(numText);

    headContainer.position.set(
      data.x * scale + this.transform.offsetX,
      data.y * scale + this.transform.offsetY
    );
    cont.addChild(headContainer);

    // Approach circle
    const approach = new Sprite(this.skin.approachCircle);
    approach.anchor.set(0.5);
    approach.tint = comboColor;
    approach.label = 'approach';
    approach.position.set(
      data.x * scale + this.transform.offsetX,
      data.y * scale + this.transform.offsetY
    );
    cont.addChild(approach);

    // Slider ball (hidden initially)
    const ball = new Sprite(this.skin.sliderBall);
    ball.anchor.set(0.5);
    ball.width = radius * 2 * scale;
    ball.height = radius * 2 * scale;
    ball.visible = false;
    cont.addChild(ball);

    cont.zIndex = -data.time;
    this.container.addChild(cont);

    const totalTicks = Math.max(
      0,
      Math.floor(
        (data.duration / (60000 / 120)) * // approximate ticks
          this.difficulty.sliderTickRate
      ) - 1
    );

    const sliderObj: ActiveSlider = {
      data,
      container: cont,
      state: 'waiting',
      comboNumber,
      comboColor,
      path,
      bodyGraphics,
      ball,
      headHit: false,
      tracking: false,
      ticksHit: 0,
      totalTicks,
    };

    this.objects.push(sliderObj);
  }

  private spawnSpinner(
    data: Spinner,
    comboNumber: number,
    comboColor: number
  ): void {
    const cont = new Container();

    // Spinner visual
    const spinnerCircle = new Sprite(this.skin.spinnerCircle);
    spinnerCircle.anchor.set(0.5);
    spinnerCircle.width = 300;
    spinnerCircle.height = 300;
    cont.addChild(spinnerCircle);

    // Progress ring
    const progress = new Graphics();
    cont.addChild(progress);

    const screenX =
      256 * this.transform.scale + this.transform.offsetX;
    const screenY =
      192 * this.transform.scale + this.transform.offsetY;
    cont.position.set(screenX, screenY);
    cont.zIndex = -data.time;

    this.container.addChild(cont);

    const duration = data.endTime - data.time;
    const requiredRotations = Math.max(1, duration / 500);

    const spinnerObj: ActiveSpinner = {
      data,
      container: cont,
      state: 'waiting',
      comboNumber,
      comboColor,
      totalRotation: 0,
      lastAngle: null,
      requiredRotations,
      progress,
    };

    this.objects.push(spinnerObj);
  }

  private updateObject(obj: ActiveHitObject, songTimeMs: number): void {
    if (obj.data.type === 'circle' || obj.data.type === 'slider') {
      this.updateApproach(obj, songTimeMs);
    }

    if (obj.data.type === 'slider') {
      this.updateSlider(obj as ActiveSlider, songTimeMs);
    }

    if (obj.data.type === 'spinner') {
      this.updateSpinnerVisual(obj as ActiveSpinner, songTimeMs);
    }
  }

  private updateApproach(obj: ActiveHitObject, songTimeMs: number): void {
    const approachTime = this.difficulty.approachTime;
    const radius = this.difficulty.circleRadius;
    const scale = this.transform.scale;

    // Find approach circle child
    const approach = obj.container.children.find(
      (c) => c.label === 'approach'
    ) as Sprite | undefined;
    if (!approach) return;

    const elapsed = songTimeMs - (obj.data.time - approachTime);
    const progress = Math.min(1, elapsed / approachTime);

    // Approach circle shrinks from 3x to 1x
    const approachScale = 3 - 2 * progress;
    const size = radius * 2 * scale * approachScale;
    approach.width = size;
    approach.height = size;

    // Fade in at the start
    const fadeIn = Math.min(1, progress * 3);
    obj.container.alpha = fadeIn;

    // After hit time, approach circle should be at 1x
    if (progress >= 1) {
      approach.visible = false;
    }
  }

  private updateSlider(slider: ActiveSlider, songTimeMs: number): void {
    if (songTimeMs < slider.data.time) return;

    const elapsed = songTimeMs - slider.data.time;
    const duration = slider.data.duration;
    let progress = Math.min(1, elapsed / duration);

    // Handle slider repeats
    if (slider.data.slides > 1) {
      const slideProgress = progress * slider.data.slides;
      const currentSlide = Math.floor(slideProgress);
      const slideT = slideProgress - currentSlide;
      progress = currentSlide % 2 === 0 ? slideT : 1 - slideT;
    }

    // Move ball along path
    const pos = getPositionAlongPath(slider.path, progress);
    slider.ball.visible = true;
    slider.ball.position.set(
      pos.x * this.transform.scale + this.transform.offsetX,
      pos.y * this.transform.scale + this.transform.offsetY
    );
  }

  private updateSpinnerVisual(
    spinner: ActiveSpinner,
    _songTimeMs: number
  ): void {
    const rotations = spinner.totalRotation / (2 * Math.PI);
    const progress = Math.min(1, rotations / spinner.requiredRotations);

    // Draw progress arc
    spinner.progress.clear();
    if (progress > 0) {
      const arcAngle = progress * 2 * Math.PI;
      spinner.progress.arc(0, 0, 120, -Math.PI / 2, -Math.PI / 2 + arcAngle);
      spinner.progress.stroke({ color: 0x66ff66, width: 8, alpha: 0.8 });
    }
  }

  private finishSlider(slider: ActiveSlider, songTimeMs: number): void {
    // Simple slider scoring: based on head hit + tracking
    let judgment: Judgment;
    if (slider.headHit && slider.tracking) {
      judgment = 300;
    } else if (slider.headHit) {
      judgment = 100;
    } else {
      judgment = 0;
    }
    this.judgeObject(slider, judgment, songTimeMs);
  }

  private finishSpinner(spinner: ActiveSpinner, songTimeMs: number): void {
    const rotations = spinner.totalRotation / (2 * Math.PI);
    const ratio = rotations / spinner.requiredRotations;

    let judgment: Judgment;
    if (ratio >= 1) judgment = 300;
    else if (ratio >= 0.75) judgment = 100;
    else if (ratio >= 0.5) judgment = 50;
    else judgment = 0;

    this.judgeObject(spinner, judgment, songTimeMs);
  }

  private judgeObject(
    obj: ActiveHitObject,
    judgment: Judgment,
    timeMs: number
  ): void {
    obj.state = judgment > 0 ? 'hit' : 'missed';

    // Show judgment indicator
    const indicator = new Text({
      text: judgment === 0 ? 'X' : String(judgment),
      style: {
        fontSize: 32,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: JUDGMENT_COLORS[judgment],
        align: 'center',
      },
    });
    indicator.anchor.set(0.5);
    indicator.position.copyFrom(obj.container.position);
    indicator.zIndex = 999999;
    this.container.addChild(indicator);

    const indicatorContainer = new Container();
    indicatorContainer.addChild(indicator);
    indicatorContainer.position.copyFrom(obj.container.position);
    indicator.position.set(0, 0);
    indicatorContainer.zIndex = 999999;
    this.container.addChild(indicatorContainer);

    // Remove the hit object visual
    this.container.removeChild(obj.container);
    obj.container.destroy({ children: true });

    this.judgedObjects.push({ container: indicatorContainer, time: timeMs });
    this.onJudgment?.(judgment, obj.data);
  }

  destroy(): void {
    this.container.removeChildren();
    this.objects = [];
    this.judgedObjects = [];
  }
}
