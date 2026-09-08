import { describe, expect, it } from "vitest";

import { arcGeometry, clipToBox, polylinePath } from "./arc";
import type { OriginalSize, Point, RenderedRect } from "./coordinates";

const ORIGINAL: OriginalSize = { width: 1000, height: 800 };
const RENDERED: RenderedRect = { left: 0, top: 0, width: 500, height: 400 };

/** Three points on a circle of radius 100 centred at (300, 400) in originals. */
const ARC_POINTS: Point[] = [
  { x: 200, y: 400 },
  { x: 300, y: 500 },
  { x: 400, y: 400 },
];

describe("arcGeometry", () => {
  it("maps the fitted centre and arc into rendered space", () => {
    const arc = arcGeometry(ARC_POINTS, RENDERED, ORIGINAL)!;

    expect(arc.radiusPx).toBeCloseTo(100, 6);
    // The rendered space is half the original on both axes.
    expect(arc.center.x).toBeCloseTo(150, 6);
    expect(arc.center.y).toBeCloseTo(200, 6);
  });

  it("sweeps the way that passes through the middle point", () => {
    const arc = arcGeometry(ARC_POINTS, RENDERED, ORIGINAL)!;

    // The arc runs below the centre, through (300, 500) -> (150, 250) rendered,
    // rather than the long way over the top.
    expect(arc.midpoint.x).toBeCloseTo(150, 6);
    expect(arc.midpoint.y).toBeCloseTo(250, 6);
    for (const point of arc.polyline) expect(point.y).toBeGreaterThanOrEqual(199);
  });

  it("sweeps the other way when the points are given in the other order", () => {
    const arc = arcGeometry([...ARC_POINTS].reverse(), RENDERED, ORIGINAL)!;

    expect(arc.midpoint.x).toBeCloseTo(150, 6);
    expect(arc.midpoint.y).toBeCloseTo(250, 6);
  });

  it("draws the arc between the placed points and no further", () => {
    const arc = arcGeometry(ARC_POINTS, RENDERED, ORIGINAL)!;
    const first = arc.polyline[0];
    const last = arc.polyline[arc.polyline.length - 1];

    expect(first.x).toBeCloseTo(100, 4);
    expect(first.y).toBeCloseTo(200, 4);
    expect(last.x).toBeCloseTo(200, 4);
    expect(last.y).toBeCloseTo(200, 4);
    // Every sample sits on the fitted circle: 50 rendered px from the centre.
    for (const point of arc.polyline) {
      expect(Math.hypot(point.x - arc.center.x, point.y - arc.center.y)).toBeCloseTo(50, 4);
    }
  });

  it("points `outward` away from the centre, where the caption can go", () => {
    const arc = arcGeometry(ARC_POINTS, RENDERED, ORIGINAL)!;

    expect(arc.outward.x).toBeCloseTo(0, 6);
    expect(arc.outward.y).toBeCloseTo(1, 6);
  });

  it("returns null for collinear points, which have no radius", () => {
    expect(
      arcGeometry(
        [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }],
        RENDERED,
        ORIGINAL,
      ),
    ).toBeNull();
  });

  it("returns null before the image has been measured", () => {
    expect(arcGeometry(ARC_POINTS, { left: 0, top: 0, width: 0, height: 0 }, ORIGINAL)).toBeNull();
  });
});

describe("clipToBox", () => {
  it("trims a radius line that runs off the image", () => {
    const clipped = clipToBox({ x: 50, y: 50 }, { x: 50, y: -500 }, { width: 200, height: 200 })!;

    expect(clipped[0]).toEqual({ x: 50, y: 50 });
    expect(clipped[1].y).toBeCloseTo(0, 6);
  });

  it("keeps a segment that is already inside", () => {
    const clipped = clipToBox({ x: 10, y: 10 }, { x: 90, y: 90 }, { width: 200, height: 200 })!;

    expect(clipped[0]).toEqual({ x: 10, y: 10 });
    expect(clipped[1]).toEqual({ x: 90, y: 90 });
  });

  it("returns null when nothing of the segment is on the image", () => {
    expect(
      clipToBox({ x: -50, y: -50 }, { x: -10, y: -10 }, { width: 200, height: 200 }),
    ).toBeNull();
  });
});

describe("polylinePath", () => {
  it("moves once and then lines through every sample", () => {
    expect(polylinePath([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe("M 1.00 2.00 L 3.00 4.00");
  });
});
