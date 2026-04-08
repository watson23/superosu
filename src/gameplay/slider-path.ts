// Compute slider curve paths: Linear, Bézier, Perfect Circle

import type { CurveType } from '../core/beatmap-parser.ts';

export interface PathPoint {
  x: number;
  y: number;
}

const PATH_RESOLUTION = 5; // pixels between sampled points

export function computeSliderPath(
  startX: number,
  startY: number,
  curveType: CurveType,
  controlPoints: PathPoint[],
  length: number
): PathPoint[] {
  const allPoints: PathPoint[] = [{ x: startX, y: startY }, ...controlPoints];

  let rawPoints: PathPoint[];

  switch (curveType) {
    case 'L':
      rawPoints = linearPath(allPoints);
      break;
    case 'P':
      rawPoints =
        allPoints.length === 3
          ? perfectCirclePath(allPoints[0], allPoints[1], allPoints[2])
          : bezierPath(allPoints);
      break;
    case 'B':
      rawPoints = bezierPath(allPoints);
      break;
    case 'C':
      rawPoints = catmullPath(allPoints);
      break;
    default:
      rawPoints = linearPath(allPoints);
  }

  // Truncate or extend path to desired length
  return truncateToLength(rawPoints, length);
}

function linearPath(points: PathPoint[]): PathPoint[] {
  const result: PathPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(segLen / PATH_RESOLUTION));

    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      result.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  return result;
}

function bezierPath(points: PathPoint[]): PathPoint[] {
  // Split at duplicate control points (red anchors in editor)
  const segments: PathPoint[][] = [];
  let current: PathPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    if (
      points[i].x === points[i - 1].x &&
      points[i].y === points[i - 1].y
    ) {
      segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  segments.push(current);

  const result: PathPoint[] = [];
  for (const seg of segments) {
    const segPoints = bezierCurve(seg);
    result.push(...segPoints);
  }
  return result;
}

function bezierCurve(points: PathPoint[]): PathPoint[] {
  if (points.length < 2) return points;

  // Estimate length for step count
  let approxLen = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    approxLen += Math.sqrt(dx * dx + dy * dy);
  }
  const steps = Math.max(2, Math.ceil(approxLen / PATH_RESOLUTION));

  const result: PathPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    result.push(deCasteljau(points, t));
  }
  return result;
}

function deCasteljau(points: PathPoint[], t: number): PathPoint {
  if (points.length === 1) return points[0];
  const next: PathPoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    next.push({
      x: points[i].x * (1 - t) + points[i + 1].x * t,
      y: points[i].y * (1 - t) + points[i + 1].y * t,
    });
  }
  return deCasteljau(next, t);
}

function perfectCirclePath(
  p0: PathPoint,
  p1: PathPoint,
  p2: PathPoint
): PathPoint[] {
  // Find circumscribed circle
  const ax = p0.x,
    ay = p0.y;
  const bx = p1.x,
    by = p1.y;
  const cx = p2.x,
    cy = p2.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 0.001) {
    // Points are collinear, fall back to linear
    return linearPath([p0, p1, p2]);
  }

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;

  const radius = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);

  // Determine arc direction
  const startAngle = Math.atan2(ay - uy, ax - ux);
  const midAngle = Math.atan2(by - uy, bx - ux);
  const endAngle = Math.atan2(cy - uy, cx - ux);

  // Check if we go clockwise or counter-clockwise
  const cross =
    (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const clockwise = cross < 0;

  let startA = startAngle;
  let endA = endAngle;

  if (clockwise) {
    while (endA > startA) endA -= 2 * Math.PI;
  } else {
    while (endA < startA) endA += 2 * Math.PI;
  }

  // Verify mid angle is in range
  let midA = midAngle;
  if (clockwise) {
    while (midA > startA) midA -= 2 * Math.PI;
    if (midA < endA) {
      // Wrong direction, flip
      endA = endAngle;
      while (endA < startA) endA += 2 * Math.PI;
    }
  } else {
    while (midA < startA) midA += 2 * Math.PI;
    if (midA > endA) {
      endA = endAngle;
      while (endA > startA) endA -= 2 * Math.PI;
    }
  }

  const arcLength = Math.abs(endA - startA) * radius;
  const steps = Math.max(2, Math.ceil(arcLength / PATH_RESOLUTION));

  const result: PathPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startA + (endA - startA) * t;
    result.push({
      x: ux + radius * Math.cos(angle),
      y: uy + radius * Math.sin(angle),
    });
  }
  return result;
}

function catmullPath(points: PathPoint[]): PathPoint[] {
  if (points.length < 2) return points;
  const result: PathPoint[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(points.length - 1, i + 1)];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(2, Math.ceil(segLen / PATH_RESOLUTION));

    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const t2 = t * t;
      const t3 = t2 * t;

      result.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return result;
}

function truncateToLength(
  points: PathPoint[],
  targetLength: number
): PathPoint[] {
  if (points.length < 2) return points;

  const result: PathPoint[] = [points[0]];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (accumulated + segLen >= targetLength) {
      const remaining = targetLength - accumulated;
      const t = segLen > 0 ? remaining / segLen : 0;
      result.push({
        x: points[i - 1].x + dx * t,
        y: points[i - 1].y + dy * t,
      });
      return result;
    }

    accumulated += segLen;
    result.push(points[i]);
  }

  return result;
}

// Get position at a fraction (0..1) along the path
export function getPositionAlongPath(
  path: PathPoint[],
  fraction: number
): PathPoint {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1 || fraction <= 0) return path[0];
  if (fraction >= 1) return path[path.length - 1];

  // Calculate total length
  let totalLen = 0;
  const segLengths: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const l = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(l);
    totalLen += l;
  }

  const targetDist = fraction * totalLen;
  let dist = 0;

  for (let i = 0; i < segLengths.length; i++) {
    if (dist + segLengths[i] >= targetDist) {
      const t = segLengths[i] > 0 ? (targetDist - dist) / segLengths[i] : 0;
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * t,
        y: path[i].y + (path[i + 1].y - path[i].y) * t,
      };
    }
    dist += segLengths[i];
  }

  return path[path.length - 1];
}
