/** Plain drawing maths for the dashboard charts: numbers in, SVG coordinates out. No React here. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface DonutShape {
  cx: number;
  cy: number;
  outer: number;
  inner: number;
}

const point = (cx: number, cy: number, r: number, angle: number) =>
  `${round(cx + r * Math.cos(angle))} ${round(cy + r * Math.sin(angle))}`;

/**
 * One SVG path per slice of a donut, clockwise from the top. `shares` are fractions that add up
 * to 1. Draw them with fill-rule "evenodd": a slice that is the whole ring has a hole.
 */
export function donutPaths(shares: readonly number[], shape: DonutShape): string[] {
  const { cx, cy, outer, inner } = shape;
  let start = -Math.PI / 2;
  return shares.map((share) => {
    if (share >= 0.9999) {
      const ring = (r: number) =>
        `M ${point(cx, cy, r, -Math.PI / 2)} A ${r} ${r} 0 1 1 ${point(cx, cy, r, Math.PI / 2)} A ${r} ${r} 0 1 1 ${point(cx, cy, r, -Math.PI / 2)} Z`;
      return `${ring(outer)} ${ring(inner)}`;
    }
    const end = start + share * 2 * Math.PI;
    const large = share > 0.5 ? 1 : 0;
    const path =
      `M ${point(cx, cy, outer, start)} A ${outer} ${outer} 0 ${large} 1 ${point(cx, cy, outer, end)} ` +
      `L ${point(cx, cy, inner, end)} A ${inner} ${inner} 0 ${large} 0 ${point(cx, cy, inner, start)} Z`;
    start = end;
    return path;
  });
}

export interface BarPair {
  a: Rect;
  b: Rect;
  /** Middle of the pair, for its label. */
  center: number;
}

/**
 * Two bars side by side for every month (such as income and expenses), standing on the bottom
 * edge. Both series share one scale, so the tallest bar of either fills `height`.
 */
export function groupedBars(
  pairs: ReadonlyArray<readonly [number, number]>,
  size: { width: number; height: number },
): BarPair[] {
  const top = Math.max(1, ...pairs.flat());
  const slot = size.width / Math.max(1, pairs.length);
  const barWidth = round(slot * 0.36);
  const bar = (x: number, value: number): Rect => {
    const height = round((value / top) * size.height);
    return { x: round(x), y: round(size.height - height), width: barWidth, height };
  };
  return pairs.map(([a, b], i) => {
    const left = i * slot + slot * 0.1;
    return {
      a: bar(left, a),
      b: bar(left + barWidth + slot * 0.04, b),
      center: round(i * slot + slot / 2),
    };
  });
}

export interface Trend {
  /** Where the zero line is. */
  zeroY: number;
  /** One bar per month, growing up from the zero line for a gain and down for a loss. */
  bars: Rect[];
  /** The running total as the `points` of a polyline. */
  line: string;
}

/**
 * Monthly net as bars and the running total as a line, on one scale that always includes zero.
 * `pad` keeps the line and bars off the very top and bottom edge.
 */
export function trend(
  nets: readonly number[],
  running: readonly number[],
  size: { width: number; height: number; pad?: number },
): Trend {
  const pad = size.pad ?? 4;
  const bottom = Math.min(0, ...nets, ...running);
  // With nothing but zeros there is no scale; the zero line then rests on the bottom edge.
  const top = Math.max(0, ...nets, ...running) || (bottom === 0 ? 1 : 0);
  const range = top - bottom;
  const usable = size.height - 2 * pad;
  const y = (value: number) => round(pad + ((top - value) / range) * usable);
  const slot = size.width / Math.max(1, nets.length);
  const barWidth = round(slot * 0.5);
  const zeroY = y(0);
  const bars = nets.map((net, i) => {
    const valueY = y(net);
    return {
      x: round(i * slot + (slot - barWidth) / 2),
      y: Math.min(zeroY, valueY),
      width: barWidth,
      height: round(Math.abs(zeroY - valueY)),
    };
  });
  const line = running.map((value, i) => `${round(i * slot + slot / 2)},${y(value)}`).join(' ');
  return { zeroY, bars, line };
}
