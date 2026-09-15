/**
 * Live-stroke helpers shared by the web Editor and the native InkOverlay.
 *
 * Contract: both platforms sample pointer input at different rates (browser
 * coalesced/predicted events vs. bridge-delivered PanResponder moves), but
 * they share the same math for (1) filling gaps between sparse samples and
 * (2) extending the on-screen preview path in O(1) per point. Platforms own
 * input + rendering; this module owns the point math so fast strokes look
 * identical everywhere.
 */

export type LiveGapPoint = { x: number; y: number };

/** Upper bound on interpolated points per input event (pathological jumps). */
export const LIVE_GAP_MAX_POINTS = 64;

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/**
 * Interior points along the segment from (lastX, lastY) to (x, y), spaced
 * `step` apart. Excludes the start point; excludes the end point (the caller
 * appends the real sample itself so pressure stays exact).
 */
export function interpolateGapPoints(
  lastX: number,
  lastY: number,
  x: number,
  y: number,
  step: number,
): LiveGapPoint[] {
  const out: LiveGapPoint[] = [];
  if (!Number.isFinite(lastX) || !Number.isFinite(lastY)) return out;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return out;
  const s = Math.max(0.5, step);
  const dx = x - lastX;
  const dy = y - lastY;
  const dist = Math.hypot(dx, dy);
  if (!(dist > s)) return out;
  const n = Math.min(LIVE_GAP_MAX_POINTS, Math.floor(dist / s));
  for (let i = 1; i <= n; i++) {
    const t = (i * s) / dist;
    if (t >= 1) break;
    out.push({ x: lastX + dx * t, y: lastY + dy * t });
  }
  return out;
}

/**
 * Extend a live preview path with one point. The preview is a plain
 * polyline (`M`/`L` only) — cheap to extend per event. Pressure ribbons are
 * computed once at commit time, not per frame.
 */
export function extendLivePath(d: string, x: number, y: number): string {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return d;
  return d === "" ? `M ${fmt(x)} ${fmt(y)}` : `${d} L ${fmt(x)} ${fmt(y)}`;
}

/**
 * Batch version of {@link extendLivePath}: appends many points with a single
 * string concatenation. Per-point `extendLivePath` in a loop copies the whole
 * path string on every sample (O(k*n) per move event, O(n²) over a stroke),
 * which janks the JS thread on fast strokes where gap interpolation emits up
 * to 64 points per bridge event. Prefer this whenever appending >1 point.
 */
export function extendLivePathMany(
  d: string,
  points: readonly LiveGapPoint[],
): string {
  if (points.length === 0) return d;
  let chunk = "";
  let started = d !== "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (!started) {
      chunk += `M ${fmt(p.x)} ${fmt(p.y)}`;
      started = true;
    } else {
      chunk += ` L ${fmt(p.x)} ${fmt(p.y)}`;
    }
  }
  if (chunk === "") return d;
  return d === "" ? chunk : `${d}${chunk}`;
}
