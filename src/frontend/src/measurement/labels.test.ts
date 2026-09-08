import { describe, expect, it } from "vitest";

import { estimateTextWidth, layoutLabels, truncate, type LabelRequest } from "./labels";

const BOUNDS = { width: 600, height: 400 };

function request(overrides: Partial<LabelRequest> & { key: number }): LabelRequest {
  return {
    text: "폭(CD) · 34.80nm",
    anchor: { x: 300, y: 200 },
    direction: { x: 0, y: -1 },
    priority: 1,
    ...overrides,
  };
}

function overlapping(a: { center: { x: number; y: number }; width: number; height: number },
                     b: { center: { x: number; y: number }; width: number; height: number }): boolean {
  return (
    Math.abs(a.center.x - b.center.x) * 2 < a.width + b.width &&
    Math.abs(a.center.y - b.center.y) * 2 < a.height + b.height
  );
}

describe("estimateTextWidth", () => {
  it("counts Hangul as full width and latin as roughly half", () => {
    expect(estimateTextWidth("가나", 10)).toBeCloseTo(20, 6);
    expect(estimateTextWidth("ab", 10)).toBeCloseTo(11.2, 6);
  });
});

describe("truncate", () => {
  it("leaves a short name alone and elides a long one", () => {
    expect(truncate("Gate CD", 14)).toBe("Gate CD");
    expect(truncate("바닥 곡률 반경 측정값", 8)).toBe("바닥 곡률 반…");
  });
});

describe("layoutLabels", () => {
  it("separates captions that share an anchor", () => {
    // Auto extraction anchors width and height within a few pixels of each
    // other at the centre of the same region; unlaid-out captions stack there.
    const placed = layoutLabels(
      [
        request({ key: 1, text: "폭(CD) · 34.80nm" }),
        request({ key: 2, text: "높이 · 91.80nm", anchor: { x: 302, y: 204 } }),
        request({ key: 3, text: "간격 · 72.00nm", anchor: { x: 298, y: 197 } }),
      ],
      BOUNDS,
    );

    expect(placed).toHaveLength(3);
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(overlapping(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("keeps every caption inside the image", () => {
    const placed = layoutLabels(
      [
        request({ key: 1, anchor: { x: 2, y: 2 } }),
        request({ key: 2, anchor: { x: 598, y: 398 }, direction: { x: 0, y: 1 } }),
      ],
      BOUNDS,
    );

    for (const label of placed) {
      expect(label.center.x - label.width / 2).toBeGreaterThanOrEqual(0);
      expect(label.center.y - label.height / 2).toBeGreaterThanOrEqual(0);
      expect(label.center.x + label.width / 2).toBeLessThanOrEqual(BOUNDS.width);
      expect(label.center.y + label.height / 2).toBeLessThanOrEqual(BOUNDS.height);
    }
  });

  it("gives the selected caption its preferred spot", () => {
    const placed = layoutLabels(
      [
        request({ key: 1, priority: 1 }),
        request({ key: 2, priority: 0 }),
      ],
      BOUNDS,
    );
    const selected = placed.find((label) => label.key === 2)!;
    const other = placed.find((label) => label.key === 1)!;

    // The prioritised caption sits directly above its anchor; the other moved.
    expect(selected.center.x).toBeCloseTo(300, 6);
    expect(selected.center.y).toBeLessThan(200);
    expect(selected.center.y).toBeGreaterThan(160);
    expect(overlapping(selected, other)).toBe(false);
  });

  it("never covers its own anchor point", () => {
    const [placed] = layoutLabels([request({ key: 1 })], BOUNDS);

    expect(placed.center.y + placed.height / 2).toBeLessThan(placed.anchor.y);
  });

  it("falls back to a sane direction when the shape is degenerate", () => {
    const [placed] = layoutLabels(
      [request({ key: 1, direction: { x: 0, y: 0 } })],
      BOUNDS,
    );

    expect(Number.isFinite(placed.center.x)).toBe(true);
    expect(Number.isFinite(placed.center.y)).toBe(true);
    expect(placed.center.y).toBeLessThan(placed.anchor.y);
  });
});
