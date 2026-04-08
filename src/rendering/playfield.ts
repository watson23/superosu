// osu! playfield coordinate system: 512×384 virtual pixels
// This module handles scaling to actual screen size with letterboxing

export const OSU_WIDTH = 512;
export const OSU_HEIGHT = 384;

export interface PlayfieldTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function computePlayfieldTransform(
  screenWidth: number,
  screenHeight: number
): PlayfieldTransform {
  const scaleX = screenWidth / OSU_WIDTH;
  const scaleY = screenHeight / OSU_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  const width = OSU_WIDTH * scale;
  const height = OSU_HEIGHT * scale;
  const offsetX = (screenWidth - width) / 2;
  const offsetY = (screenHeight - height) / 2;

  return { scale, offsetX, offsetY, width, height };
}

export function screenToOsu(
  screenX: number,
  screenY: number,
  transform: PlayfieldTransform
): { x: number; y: number } {
  return {
    x: (screenX - transform.offsetX) / transform.scale,
    y: (screenY - transform.offsetY) / transform.scale,
  };
}

export function osuToScreen(
  osuX: number,
  osuY: number,
  transform: PlayfieldTransform
): { x: number; y: number } {
  return {
    x: osuX * transform.scale + transform.offsetX,
    y: osuY * transform.scale + transform.offsetY,
  };
}
