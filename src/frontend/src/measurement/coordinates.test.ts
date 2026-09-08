import { describe, expect, it } from "vitest";

import { toOriginalPoint, toRenderedPoint } from "./coordinates";

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
});
