// Pointer event handling for multi-touch rhythm game input

import type { PlayfieldTransform } from '../rendering/playfield.ts';
import { screenToOsu } from '../rendering/playfield.ts';

export interface TapEvent {
  x: number; // osu! coordinates
  y: number;
  time: number; // performance.now() timestamp
  pointerId: number;
}

export type TapCallback = (tap: TapEvent) => void;

export class InputHandler {
  private transform: PlayfieldTransform | null = null;
  private callbacks: TapCallback[] = [];
  private activePointers = new Map<number, { x: number; y: number }>();
  private bound = false;

  setTransform(t: PlayfieldTransform): void {
    this.transform = t;
  }

  onTap(cb: TapCallback): void {
    this.callbacks.push(cb);
  }

  clearCallbacks(): void {
    this.callbacks = [];
  }

  getActivePointers(): Map<number, { x: number; y: number }> {
    return this.activePointers;
  }

  bind(el: HTMLElement): void {
    if (this.bound) return;
    this.bound = true;

    el.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        e.preventDefault();
        if (!this.transform) return;

        const osu = screenToOsu(e.clientX, e.clientY, this.transform);
        this.activePointers.set(e.pointerId, osu);

        const tap: TapEvent = {
          x: osu.x,
          y: osu.y,
          time: e.timeStamp,
          pointerId: e.pointerId,
        };

        for (const cb of this.callbacks) cb(tap);
      },
      { passive: false }
    );

    el.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        e.preventDefault();
        if (!this.transform) return;
        const osu = screenToOsu(e.clientX, e.clientY, this.transform);
        this.activePointers.set(e.pointerId, osu);
      },
      { passive: false }
    );

    const removePointer = (e: PointerEvent) => {
      this.activePointers.delete(e.pointerId);
    };

    el.addEventListener('pointerup', removePointer);
    el.addEventListener('pointercancel', removePointer);
  }
}

export const inputHandler = new InputHandler();
