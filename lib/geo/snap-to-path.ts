/**
 * Snap a point onto the closest segment of a polyline.
 *
 * Operates in degrees (lat, lon) using a small-angle equirectangular
 * approximation. Accurate enough for marker placement at city / river scale;
 * we use kilometre-level distances only as a sort key (downstream order),
 * not for navigation.
 */
import { haversineKm } from "@/lib/geo/haversine";

export interface SnapResult {
  /** Snapped point on the polyline, in [lat, lon]. */
  point: [number, number];
  /** Index of the segment in `path` that owns the snapped point (segment i = path[i]→path[i+1]). */
  segmentIndex: number;
  /** Parameter along the segment, 0 = start, 1 = end. */
  t: number;
  /** Cumulative path length from path[0] to the snapped point, in km. Use as a sort key for downstream order. */
  cumulativeKm: number;
}

/** Project a (lat, lon) point onto the segment a→b, returning {point, t}. */
function projectOntoSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): { point: [number, number]; t: number } {
  // Equirectangular projection scaled by cos(lat) so we can do plain
  // 2D vector math on what are otherwise spherical coordinates.
  const meanLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const cos = Math.cos(meanLat);
  const ax = a[1] * cos;
  const ay = a[0];
  const bx = b[1] * cos;
  const by = b[0];
  const px = p[1] * cos;
  const py = p[0];

  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return { point: a, t: 0 };

  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return {
    point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    t,
  };
}

/**
 * Find the point on `path` closest to `click` and return its snapped
 * coordinates plus its progress along the polyline.
 *
 * Returns null if `path` has fewer than two points (no segments).
 */
export function snapToPath(
  click: [number, number],
  path: [number, number][],
): SnapResult | null {
  if (!path || path.length < 2) return null;

  let best: SnapResult | null = null;
  let bestDist = Infinity;

  // Pre-compute cumulative km up to each vertex.
  const cumulativeAtVertex: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumulativeAtVertex.push(
      cumulativeAtVertex[i - 1] +
        haversineKm(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]),
    );
  }

  for (let i = 0; i < path.length - 1; i++) {
    const { point, t } = projectOntoSegment(click, path[i], path[i + 1]);
    const d = haversineKm(click[0], click[1], point[0], point[1]);
    if (d < bestDist) {
      bestDist = d;
      const segLen = cumulativeAtVertex[i + 1] - cumulativeAtVertex[i];
      best = {
        point,
        segmentIndex: i,
        t,
        cumulativeKm: cumulativeAtVertex[i] + segLen * t,
      };
    }
  }
  return best;
}

/** Cumulative km of `point` along `path`. Returns 0 if path has fewer than two points. */
export function cumulativeKmAlongPath(
  point: [number, number],
  path: [number, number][],
): number {
  const snap = snapToPath(point, path);
  return snap?.cumulativeKm ?? 0;
}
