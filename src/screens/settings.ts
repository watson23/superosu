// Settings screen: audio offset, volume, background dim

import { Container, Graphics, Text, type Application } from 'pixi.js';
import type { Screen } from './screen-manager.ts';

type ScreenNavigator = (name: string) => void;

interface SliderConfig {
  label: string;
  key: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  suffix: string;
}

export class SettingsScreen implements Screen {
  private app!: Application;
  private container!: Container;
  private navigate: ScreenNavigator;

  constructor(navigate: ScreenNavigator) {
    this.navigate = navigate;
  }

  enter(app: Application): void {
    this.app = app;
    this.container = new Container();
    app.stage.addChild(this.container);

    const bg = new Graphics();
    bg.rect(0, 0, app.screen.width, app.screen.height);
    bg.fill({ color: 0x1a1a2e });
    this.container.addChild(bg);

    const title = new Text({
      text: 'Settings',
      style: {
        fontSize: 32,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    title.anchor.set(0.5, 0);
    title.position.set(app.screen.width / 2, 20);
    this.container.addChild(title);

    const sliders: SliderConfig[] = [
      {
        label: 'Audio Offset',
        key: 'superosu_offset',
        min: -200,
        max: 200,
        step: 5,
        defaultValue: 0,
        suffix: 'ms',
      },
      {
        label: 'Master Volume',
        key: 'superosu_volume',
        min: 0,
        max: 100,
        step: 5,
        defaultValue: 80,
        suffix: '%',
      },
      {
        label: 'Background Dim',
        key: 'superosu_bg_dim',
        min: 0,
        max: 100,
        step: 5,
        defaultValue: 70,
        suffix: '%',
      },
    ];

    sliders.forEach((cfg, idx) => {
      this.createSlider(cfg, 90 + idx * 100);
    });

    // Back button
    const backBtn = new Graphics();
    backBtn.roundRect(
      app.screen.width / 2 - 60,
      app.screen.height - 60,
      120,
      44,
      8
    );
    backBtn.fill({ color: 0x4466aa });
    backBtn.eventMode = 'static';
    backBtn.cursor = 'pointer';
    backBtn.on('pointerdown', () => this.navigate('song-select'));
    this.container.addChild(backBtn);

    const backText = new Text({
      text: 'Back',
      style: {
        fontSize: 18,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    backText.anchor.set(0.5);
    backText.position.set(app.screen.width / 2, app.screen.height - 38);
    this.container.addChild(backText);
  }

  private createSlider(cfg: SliderConfig, y: number): void {
    const current = parseInt(
      localStorage.getItem(cfg.key) ?? String(cfg.defaultValue)
    );

    const label = new Text({
      text: cfg.label,
      style: { fontSize: 16, fontFamily: 'Arial', fill: 0xcccccc },
    });
    label.position.set(20, y);
    this.container.addChild(label);

    const valueText = new Text({
      text: `${current}${cfg.suffix}`,
      style: {
        fontSize: 16,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    valueText.anchor.set(1, 0);
    valueText.position.set(this.app.screen.width - 20, y);
    this.container.addChild(valueText);

    // Track
    const trackX = 20;
    const trackWidth = this.app.screen.width - 40;
    const trackY = y + 35;

    const track = new Graphics();
    track.roundRect(trackX, trackY, trackWidth, 8, 4);
    track.fill({ color: 0x333355 });
    this.container.addChild(track);

    // Thumb
    const fraction = (current - cfg.min) / (cfg.max - cfg.min);
    const thumb = new Graphics();
    thumb.circle(trackX + fraction * trackWidth, trackY + 4, 14);
    thumb.fill({ color: 0xff66aa });
    thumb.eventMode = 'static';
    thumb.cursor = 'pointer';
    this.container.addChild(thumb);

    // Drag handling
    const updateFromX = (globalX: number) => {
      const localX = Math.max(
        trackX,
        Math.min(trackX + trackWidth, globalX)
      );
      const frac = (localX - trackX) / trackWidth;
      const rawValue = cfg.min + frac * (cfg.max - cfg.min);
      const value = Math.round(rawValue / cfg.step) * cfg.step;

      localStorage.setItem(cfg.key, String(value));
      valueText.text = `${value}${cfg.suffix}`;

      const newFrac = (value - cfg.min) / (cfg.max - cfg.min);
      thumb.clear();
      thumb.circle(trackX + newFrac * trackWidth, trackY + 4, 14);
      thumb.fill({ color: 0xff66aa });
    };

    // Also allow tapping the track
    track.eventMode = 'static';
    track.on('pointerdown', (e) => updateFromX(e.globalX));

    thumb.on('pointerdown', () => {
      const onMove = (e: { globalX: number }) => updateFromX(e.globalX);
      const onUp = () => {
        this.container.off('pointermove', onMove);
        this.container.off('pointerup', onUp);
        this.container.off('pointerupoutside', onUp);
      };
      this.container.on('pointermove', onMove);
      this.container.on('pointerup', onUp);
      this.container.on('pointerupoutside', onUp);
    });
  }

  exit(app: Application): void {
    app.stage.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}
