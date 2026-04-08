// Simple screen state machine

import type { Application } from 'pixi.js';

export interface Screen {
  enter(app: Application): void;
  exit(app: Application): void;
  update?(dt: number): void;
}

export class ScreenManager {
  private app: Application;
  private current: Screen | null = null;
  private screens = new Map<string, Screen>();

  constructor(app: Application) {
    this.app = app;
  }

  register(name: string, screen: Screen): void {
    this.screens.set(name, screen);
  }

  goto(name: string): void {
    const next = this.screens.get(name);
    if (!next) throw new Error(`Unknown screen: ${name}`);

    if (this.current) {
      this.current.exit(this.app);
    }

    this.current = next;
    this.current.enter(this.app);
  }

  update(dt: number): void {
    this.current?.update?.(dt);
  }
}
