import polyline from "@mapbox/polyline";

import type { Checkpoint, RiskName, Route } from "../api/types";
import { worse } from "./risk";

export type LonLat = [number, number];

const EARTH_RADIUS_MI = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMi([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}

export function decodePath(encoded: string): LonLat[] {
  return polyline.decode(encoded, 5).map(([lat, lon]) => [lon, lat]);
}

export interface RiskSegment {
  path: LonLat[];
  risk: RiskName;
}

/** Split a route path at its checkpoints; each piece takes the worse of its two checkpoint risks. */
export function riskSegments(path: LonLat[], checkpoints: Checkpoint[]): RiskSegment[] {
  if (checkpoints.length < 2 || path.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineMi(path[i - 1], path[i]));
  // Server miles and client miles can differ slightly; scale so the ends line up.
  const scale = cum[cum.length - 1] / (checkpoints[checkpoints.length - 1].mile || 1);

  const segments: RiskSegment[] = [];
  let i = 0;
  for (let k = 0; k < checkpoints.length - 1; k++) {
    const endMile = checkpoints[k + 1].mile * scale;
    const piece: LonLat[] = [path[i]];
    while (i < path.length - 1 && cum[i + 1] <= endMile) piece.push(path[++i]);
    if (i < path.length - 1) piece.push(interpolate(path, cum, i, endMile));
    segments.push({ path: piece, risk: worse(checkpoints[k].risk, checkpoints[k + 1].risk) });
  }
  return segments;
}

function interpolate(path: LonLat[], cum: number[], i: number, mile: number): LonLat {
  const span = cum[i + 1] - cum[i];
  const t = span > 0 ? (mile - cum[i]) / span : 0;
  return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
}

/** Truck position `seconds` after departure, from the route's (lat, lon, t) track. */
export function positionAt(track: Route["track"], seconds: number): LonLat {
  if (seconds <= track[0][2]) return [track[0][1], track[0][0]];
  const last = track[track.length - 1];
  if (seconds >= last[2]) return [last[1], last[0]];
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid][2] <= seconds) lo = mid;
    else hi = mid;
  }
  const [lat1, lon1, t1] = track[lo];
  const [lat2, lon2, t2] = track[hi];
  const t = t2 > t1 ? (seconds - t1) / (t2 - t1) : 0;
  return [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t];
}

/** The point `fraction` (0..1) of the way along a path, by distance. */
export function pointAlong(path: LonLat[], fraction: number): LonLat {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversineMi(path[i - 1], path[i]));
  const target = cum[cum.length - 1] * fraction;
  const next = cum.findIndex((c) => c >= target);
  if (next === -1) return path[path.length - 1];
  return interpolate(path, cum, Math.max(0, next - 1), target);
}

export function bounds(paths: LonLat[][]): [LonLat, LonLat] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const path of paths) {
    for (const [lon, lat] of path) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}
