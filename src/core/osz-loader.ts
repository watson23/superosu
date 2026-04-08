// Load .osz files (ZIP archives containing beatmap data)

import { unzipSync } from 'fflate';
import { parseBeatmap, type Beatmap } from './beatmap-parser.ts';

export interface OszContent {
  beatmaps: Beatmap[];
  audioData: ArrayBuffer;
  backgroundBlob: Blob | null;
  audioFilename: string;
}

export function loadOsz(buffer: ArrayBuffer): OszContent {
  const files = unzipSync(new Uint8Array(buffer));

  // Find all .osu files
  const osuFiles: string[] = [];
  let audioFilename = '';
  const beatmaps: Beatmap[] = [];

  for (const name of Object.keys(files)) {
    if (name.endsWith('.osu')) {
      osuFiles.push(name);
    }
  }

  // Parse each .osu file
  for (const name of osuFiles) {
    const text = new TextDecoder().decode(files[name]);
    const beatmap = parseBeatmap(text);
    // Only include osu!standard maps
    if (beatmap.metadata.audioFilename) {
      audioFilename = beatmap.metadata.audioFilename;
    }
    beatmaps.push(beatmap);
  }

  // Load audio file
  let audioData = new ArrayBuffer(0);
  if (audioFilename) {
    // Try exact match, then case-insensitive search
    const audioFile =
      files[audioFilename] ??
      Object.entries(files).find(
        ([k]) => k.toLowerCase() === audioFilename.toLowerCase()
      )?.[1];
    if (audioFile) {
      audioData = new Uint8Array(audioFile).buffer as ArrayBuffer;
    }
  }

  // Load background image
  let backgroundBlob: Blob | null = null;
  const bgFilename = beatmaps[0]?.metadata.backgroundFilename;
  if (bgFilename) {
    const bgFile =
      files[bgFilename] ??
      Object.entries(files).find(
        ([k]) => k.toLowerCase() === bgFilename.toLowerCase()
      )?.[1];
    if (bgFile) {
      const ext = bgFilename.toLowerCase().split('.').pop() ?? 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
      backgroundBlob = new Blob([new Uint8Array(bgFile)], { type: mimeType });
    }
  }

  return { beatmaps, audioData, backgroundBlob, audioFilename };
}
