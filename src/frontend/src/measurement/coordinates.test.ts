import { describe, expect, it } from "vitest";

import {
  toOriginalPoint,
  toOriginalPointClamped,
  toRenderedPoint,
} from "./coordinates";

const original = { width: 1000, height: 800 };

describe("coordinate adapter", () => {
  it("restores original points at 100 percent rendering", () => {
    const rendered = { left: 20, top: 30, width: 1000, height: 800 };
    const originalPoint = toOriginalPoint({ x: 120, y: 130 }, rendered, original);

    expect(originalPoint).toEqual({ x: 100, y: 100 });
    expect(toRenderedPoint(originalPoint!, rendered, original)).toEqual({ x: 100, y: 100 });
  });

  it("restores each endpoint within one original pixel at 50 percent", () => {
    const rendered = { left: 10, top: 20, width: 500, height: 400 };
    const points = [{ x: 100, y: 100 }, { x: 400, y: 500 }];

    for (const point of points) {
      const display = toRenderedPoint(point, rendered, original);
      const restored = toOriginalPoint(
        { x: display.x + rendered.left, y: display.y + rendered.top },
        rendered,
        original,
      );
      expect(Math.abs(restored!.x - point.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(restored!.y - point.y)).toBeLessThanOrEqual(1);
    }
  });

  it("rejects clicks in surrounding letterbox space", () => {
    const rendered = { left: 100, top: 100, width: 500, height: 400 };

    expect(toOriginalPoint({ x: 99, y: 200 }, rendered, original)).toBeNull();
    expect(toOriginalPoint({ x: 200, y: 500 }, rendered, original)).toBeNull();
  });

  it("clamps out-of-bounds drags to the image edge instead of rejecting them", () => {
    const rendered = { left: 100, top: 100, width: 500, height: 400 };

    // A drag that leaves the image on the top-left snaps to the origin.
    expect(toOriginalPointClamped({ x: 40, y: 20 }, rendered, original)).toEqual({ x: 0, y: 0 });
    // A drag past the bottom-right snaps to the far corner (original size).
    expect(toOriginalPointClamped({ x: 900, y: 900 }, rendered, original)).toEqual({
      x: 1000,
      y: 800,
    });
    // An in-bounds drag maps like the strict adapter.
    expect(toOriginalPointClamped({ x: 350, y: 300 }, rendered, original)).toEqual({
      x: 500,
      y: 400,
    });
  });

  it("returns null only when dimensions are invalid", () => {
    const original0 = { width: 0, height: 800 };
    const rendered = { left: 0, top: 0, width: 500, height: 400 };

    expect(toOriginalPointClamped({ x: 10, y: 10 }, rendered, original0)).toBeNull();
  });
});
