import { describe, expect, it } from 'vitest';
import { donutPaths, groupedBars, trend } from './geometry';

const shape = { cx: 50, cy: 50, outer: 40, inner: 25 };

describe('donutPaths', () => {
  it('gives one path per slice', () => {
    expect(donutPaths([0.5, 0.3, 0.2], shape)).toHaveLength(3);
    expect(donutPaths([], shape)).toEqual([]);
  });

  it('starts at the top and runs clockwise', () => {
    const [path] = donutPaths([0.25, 0.75], shape);
    // Top of the outer circle is (50, 10); a quarter turn clockwise is the right edge (90, 50).
    expect(path).toBe('M 50 10 A 40 40 0 0 1 90 50 L 75 50 A 25 25 0 0 0 50 25 Z');
  });

  it('continues each slice where the last one ended', () => {
    const [first, second] = donutPaths([0.25, 0.75], shape);
    expect(first).toContain('90 50');
    expect(second!.startsWith('M 90 50')).toBe(true);
  });

  it('uses the large arc only for a slice of more than half', () => {
    const [small, big, exactlyHalf] = donutPaths([0.3, 0.7], shape).concat(
      donutPaths([0.5], shape),
    );
    expect(small).toContain('A 40 40 0 0 1');
    expect(big).toContain('A 40 40 0 1 1');
    expect(exactlyHalf).toContain('A 40 40 0 0 1');
  });

  it('draws a single slice of everything as a full ring with a hole', () => {
    const [ring] = donutPaths([1], shape);
    expect(ring!.match(/Z/g)).toHaveLength(2);
    expect(ring).toContain('A 40 40');
    expect(ring).toContain('A 25 25');
    expect(ring).not.toContain('NaN');
  });

  it('never produces a broken number', () => {
    for (const shares of [
      [0.01, 0.99],
      [0.3333333, 0.3333333, 0.3333334],
      [1e-9, 1 - 1e-9],
    ]) {
      expect(donutPaths(shares, shape).join(' ')).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('groupedBars', () => {
  const size = { width: 120, height: 100 };

  it('makes the tallest bar of either series fill the height, the others in proportion', () => {
    const [first, second] = groupedBars(
      [
        [50, 100],
        [25, 0],
      ],
      size,
    );
    expect(first!.b.height).toBe(100);
    expect(first!.a.height).toBe(50);
    expect(second!.a.height).toBe(25);
    expect(second!.b.height).toBe(0);
  });

  it('stands every bar on the bottom edge', () => {
    for (const pair of groupedBars(
      [
        [10, 40],
        [0, 5],
      ],
      size,
    )) {
      expect(pair.a.y + pair.a.height).toBe(100);
      expect(pair.b.y + pair.b.height).toBe(100);
    }
  });

  it('puts the pairs in order from left to right without overlap', () => {
    const pairs = groupedBars(
      [
        [1, 1],
        [1, 1],
        [1, 1],
      ],
      size,
    );
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i]!;
      expect(p.b.x).toBeGreaterThan(p.a.x + p.a.width - 0.001);
      if (i > 0) expect(p.a.x).toBeGreaterThan(pairs[i - 1]!.b.x + p.b.width - 0.001);
      expect(p.b.x + p.b.width).toBeLessThanOrEqual(size.width);
    }
    expect(pairs.map((p) => p.center)).toEqual([20, 60, 100]);
  });

  it('copes with all zeros and with no months', () => {
    const zeros = groupedBars(
      [
        [0, 0],
        [0, 0],
      ],
      size,
    );
    expect(zeros.every((p) => p.a.height === 0 && p.b.height === 0)).toBe(true);
    expect(groupedBars([], size)).toEqual([]);
  });
});

describe('trend', () => {
  const size = { width: 100, height: 100, pad: 0 };

  it('puts the zero line at the bottom when nothing is negative, and bars grow up from it', () => {
    const result = trend([10, 20], [10, 30], size);
    expect(result.zeroY).toBe(100);
    expect(result.bars[0]).toMatchObject({ y: 66.67, height: 33.33 });
    expect(result.bars[1]).toMatchObject({ y: 33.33, height: 66.67 });
  });

  it('puts the zero line at the top when nothing is positive, and bars hang down from it', () => {
    const result = trend([-10, -20], [-10, -30], size);
    expect(result.zeroY).toBe(0);
    expect(result.bars[1]!.y).toBe(0);
    expect(result.bars[1]!.height).toBe(66.67);
  });

  it('puts the zero line in between for a mix, a loss hanging below a gain standing above', () => {
    const result = trend([40, -20], [40, 20], size);
    expect(result.zeroY).toBe(66.67);
    const mixed = trend([30, -30], [30, 0], size);
    expect(mixed.zeroY).toBe(50);
    expect(mixed.bars[0]).toMatchObject({ y: 0, height: 50 });
    expect(mixed.bars[1]).toMatchObject({ y: 50, height: 50 });
  });

  it('lets the running total set the scale when it goes beyond the bars', () => {
    const result = trend([10, 10], [10, 100], size);
    expect(result.line.split(' ')[1]).toBe('75,0');
    expect(result.bars[0]!.height).toBe(10);
  });

  it('draws the line through the middle of each month', () => {
    const result = trend([5, 5, 5, 5], [5, 10, 15, 20], size);
    expect(result.line.split(' ').map((p) => Number(p.split(',')[0]))).toEqual([
      12.5, 37.5, 62.5, 87.5,
    ]);
  });

  it('keeps everything inside the padding', () => {
    const result = trend([50, -50], [50, 0], { width: 100, height: 100, pad: 10 });
    for (const bar of result.bars) {
      expect(bar.y).toBeGreaterThanOrEqual(10);
      expect(bar.y + bar.height).toBeLessThanOrEqual(90);
    }
  });

  it('copes with all zeros and with no months', () => {
    const zeros = trend([0, 0], [0, 0], size);
    expect(zeros.bars.every((b) => b.height === 0)).toBe(true);
    expect(zeros.line).not.toMatch(/NaN/);
    expect(trend([], [], size)).toEqual({ zeroY: 100, bars: [], line: '' });
  });
});
