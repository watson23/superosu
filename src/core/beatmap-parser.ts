// .osu file format v14 parser for osu!standard mode

export interface BeatmapMetadata {
  title: string;
  titleUnicode: string;
  artist: string;
  artistUnicode: string;
  creator: string;
  version: string; // difficulty name
  audioFilename: string;
  previewTime: number;
  backgroundFilename: string;
}

export interface BeatmapDifficulty {
  cs: number;
  ar: number;
  od: number;
  hp: number;
  sliderMultiplier: number;
  sliderTickRate: number;
  // Derived values
  circleRadius: number; // in osu! pixels
  approachTime: number; // ms
  hitWindow300: number; // ms
  hitWindow100: number;
  hitWindow50: number;
}

export interface TimingPoint {
  time: number; // ms
  beatLength: number; // ms per beat (uninherited) or SV multiplier (inherited)
  meter: number;
  sampleSet: number;
  volume: number;
  uninherited: boolean;
  kiai: boolean;
}

export type CurveType = 'L' | 'B' | 'P' | 'C';

export interface HitCircle {
  type: 'circle';
  x: number;
  y: number;
  time: number;
  newCombo: boolean;
  hitSound: number;
}

export interface Slider {
  type: 'slider';
  x: number;
  y: number;
  time: number;
  newCombo: boolean;
  hitSound: number;
  curveType: CurveType;
  curvePoints: { x: number; y: number }[];
  slides: number;
  length: number;
  duration: number; // computed ms
}

export interface Spinner {
  type: 'spinner';
  x: number;
  y: number;
  time: number;
  newCombo: boolean;
  hitSound: number;
  endTime: number;
}

export type HitObject = HitCircle | Slider | Spinner;

export interface BreakPeriod {
  startTime: number;
  endTime: number;
}

export interface Beatmap {
  metadata: BeatmapMetadata;
  difficulty: BeatmapDifficulty;
  timingPoints: TimingPoint[];
  hitObjects: HitObject[];
  breaks: BreakPeriod[];
}

function computeDifficulty(
  cs: number,
  ar: number,
  od: number,
  hp: number,
  sliderMultiplier: number,
  sliderTickRate: number
): BeatmapDifficulty {
  const circleRadius = 54.4 - 4.48 * cs;
  const approachTime =
    ar < 5 ? 1800 - 120 * ar : ar === 5 ? 1200 : 1950 - 150 * ar;
  const hitWindow300 = 79.5 - 6 * od;
  const hitWindow100 = 139.5 - 8 * od;
  const hitWindow50 = 199.5 - 10 * od;

  return {
    cs,
    ar,
    od,
    hp,
    sliderMultiplier,
    sliderTickRate,
    circleRadius,
    approachTime,
    hitWindow300,
    hitWindow100,
    hitWindow50,
  };
}

function getTimingPointAt(
  time: number,
  timingPoints: TimingPoint[],
  uninherited: boolean
): TimingPoint | null {
  let result: TimingPoint | null = null;
  for (const tp of timingPoints) {
    if (tp.time > time) break;
    if (tp.uninherited === uninherited) result = tp;
  }
  return result;
}

function computeSliderDuration(
  length: number,
  slides: number,
  sliderMultiplier: number,
  beatLength: number,
  svMultiplier: number
): number {
  const pixelsPerBeat = sliderMultiplier * 100 * svMultiplier;
  return (length / pixelsPerBeat) * beatLength * slides;
}

export function parseBeatmap(content: string): Beatmap {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let section = '';

  const metadata: BeatmapMetadata = {
    title: '',
    titleUnicode: '',
    artist: '',
    artistUnicode: '',
    creator: '',
    version: '',
    audioFilename: '',
    previewTime: -1,
    backgroundFilename: '',
  };

  let cs = 5,
    ar = 5,
    od = 5,
    hp = 5,
    sliderMultiplier = 1.4,
    sliderTickRate = 1;
  const timingPoints: TimingPoint[] = [];
  const hitObjects: HitObject[] = [];
  const breaks: BreakPeriod[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      continue;
    }

    switch (section) {
      case 'General': {
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        if (key.trim() === 'AudioFilename') metadata.audioFilename = value;
        if (key.trim() === 'PreviewTime')
          metadata.previewTime = parseInt(value);
        break;
      }

      case 'Metadata': {
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        switch (key.trim()) {
          case 'Title':
            metadata.title = value;
            break;
          case 'TitleUnicode':
            metadata.titleUnicode = value;
            break;
          case 'Artist':
            metadata.artist = value;
            break;
          case 'ArtistUnicode':
            metadata.artistUnicode = value;
            break;
          case 'Creator':
            metadata.creator = value;
            break;
          case 'Version':
            metadata.version = value;
            break;
        }
        break;
      }

      case 'Difficulty': {
        const [key, ...rest] = line.split(':');
        const value = parseFloat(rest.join(':').trim());
        switch (key.trim()) {
          case 'CircleSize':
            cs = value;
            break;
          case 'ApproachRate':
            ar = value;
            break;
          case 'OverallDifficulty':
            od = value;
            break;
          case 'HPDrainRate':
            hp = value;
            break;
          case 'SliderMultiplier':
            sliderMultiplier = value;
            break;
          case 'SliderTickRate':
            sliderTickRate = value;
            break;
        }
        break;
      }

      case 'Events': {
        const parts = line.split(',');
        if (parts[0] === '0' && parts[1] === '0' && parts[2]) {
          metadata.backgroundFilename = parts[2].replace(/"/g, '');
        }
        if (parts[0] === '2' || parts[0].toLowerCase() === 'break') {
          breaks.push({
            startTime: parseInt(parts[1]),
            endTime: parseInt(parts[2]),
          });
        }
        break;
      }

      case 'TimingPoints': {
        const parts = line.split(',');
        if (parts.length < 2) break;
        timingPoints.push({
          time: parseFloat(parts[0]),
          beatLength: parseFloat(parts[1]),
          meter: parseInt(parts[2]) || 4,
          sampleSet: parseInt(parts[3]) || 0,
          volume: parseInt(parts[5]) || 100,
          uninherited: parts[6] === '1',
          kiai: (parseInt(parts[7]) || 0 & 1) === 1,
        });
        break;
      }

      case 'HitObjects': {
        const parts = line.split(',');
        if (parts.length < 5) break;

        const x = parseInt(parts[0]);
        const y = parseInt(parts[1]);
        const time = parseInt(parts[2]);
        const typeFlags = parseInt(parts[3]);
        const hitSound = parseInt(parts[4]);
        const newCombo = (typeFlags & 4) !== 0;

        if (typeFlags & 1) {
          // Hit circle
          hitObjects.push({ type: 'circle', x, y, time, newCombo, hitSound });
        } else if (typeFlags & 2) {
          // Slider
          const sliderData = parts[5];
          const [curveTypeStr, ...pointStrs] = sliderData.split('|');
          const curveType = curveTypeStr as CurveType;
          const curvePoints = pointStrs.map((p) => {
            const [px, py] = p.split(':');
            return { x: parseInt(px), y: parseInt(py) };
          });
          const slides = parseInt(parts[6]) || 1;
          const length = parseFloat(parts[7]) || 0;

          // Compute slider duration from timing
          const bpmPoint = getTimingPointAt(time, timingPoints, true);
          const svPoint = getTimingPointAt(time, timingPoints, false);
          const beatLength = bpmPoint?.beatLength ?? 500;
          const svMultiplier = svPoint
            ? Math.max(0.1, -100 / svPoint.beatLength)
            : 1;

          const duration = computeSliderDuration(
            length,
            slides,
            sliderMultiplier,
            beatLength,
            svMultiplier
          );

          hitObjects.push({
            type: 'slider',
            x,
            y,
            time,
            newCombo,
            hitSound,
            curveType,
            curvePoints,
            slides,
            length,
            duration,
          });
        } else if (typeFlags & 8) {
          // Spinner
          const endTime = parseInt(parts[5]);
          hitObjects.push({
            type: 'spinner',
            x: 256,
            y: 192,
            time,
            newCombo,
            hitSound,
            endTime,
          });
        }
        break;
      }
    }
  }

  // Sort hit objects by time
  hitObjects.sort((a, b) => a.time - b.time);

  const difficulty = computeDifficulty(
    cs,
    ar,
    od,
    hp,
    sliderMultiplier,
    sliderTickRate
  );

  return { metadata, difficulty, timingPoints, hitObjects, breaks };
}
