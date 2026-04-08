// Generate default skin textures procedurally using PixiJS Graphics

import { Graphics, type Application, RenderTexture } from 'pixi.js';

export interface SkinTextures {
  hitCircle: RenderTexture;
  hitCircleOverlay: RenderTexture;
  approachCircle: RenderTexture;
  sliderBall: RenderTexture;
  spinnerCircle: RenderTexture;
  cursorTrail: RenderTexture;
}

const CIRCLE_TEX_SIZE = 128;

export function generateSkinTextures(app: Application): SkinTextures {
  return {
    hitCircle: generateCircleTexture(app, 0xff66aa, true),
    hitCircleOverlay: generateCircleTexture(app, 0xffffff, false),
    approachCircle: generateApproachCircleTexture(app),
    sliderBall: generateCircleTexture(app, 0xffffff, true),
    spinnerCircle: generateCircleTexture(app, 0x44aaff, true),
    cursorTrail: generateCircleTexture(app, 0xffaa00, true),
  };
}

function generateCircleTexture(
  app: Application,
  color: number,
  filled: boolean
): RenderTexture {
  const g = new Graphics();
  const half = CIRCLE_TEX_SIZE / 2;

  if (filled) {
    g.circle(half, half, half - 4);
    g.fill({ color, alpha: 0.9 });
    g.circle(half, half, half - 4);
    g.stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
  } else {
    g.circle(half, half, half - 4);
    g.stroke({ color, width: 3, alpha: 0.9 });
  }

  const texture = RenderTexture.create({
    width: CIRCLE_TEX_SIZE,
    height: CIRCLE_TEX_SIZE,
  });
  app.renderer.render({ container: g, target: texture });
  g.destroy();
  return texture;
}

function generateApproachCircleTexture(app: Application): RenderTexture {
  const g = new Graphics();
  const half = CIRCLE_TEX_SIZE / 2;

  g.circle(half, half, half - 2);
  g.stroke({ color: 0xff66aa, width: 3, alpha: 1 });

  const texture = RenderTexture.create({
    width: CIRCLE_TEX_SIZE,
    height: CIRCLE_TEX_SIZE,
  });
  app.renderer.render({ container: g, target: texture });
  g.destroy();
  return texture;
}
