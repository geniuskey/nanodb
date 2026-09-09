import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MeasurementView } from "../api/types";
import { MeasurementOverlay } from "./MeasurementOverlay";

const ORIGINAL = { width: 1000, height: 800 };
const SIZE = { width: 500, height: 400 };

function measurement(overrides: Partial<MeasurementView> & { id: number }): MeasurementView {
  return {
    image_id: 1,
    item_id: null,
    measurement_type: "length",
    points: [{ x: 100, y: 100 }, { x: 400, y: 100 }],
    value: 60,
    unit: "nm",
    calibration_nm_per_pixel: 0.2,
    label: "Gate CD",
    note: null,
    measurement_method: "manual",
    source: "manual",
    confidence: null,
    reference_status: "unreviewed",
    original_points: null,
    original_value: null,
    adjusted_at: null,
    created_at: "2026-09-09T00:00:00Z",
    ...overrides,
  };
}

/** The six features auto extraction puts on one region, as it stores them. */
const AUTO_SET: MeasurementView[] = [
  measurement({ id: 1, label: "auto: 폭(CD)", points: [{ x: 232, y: 376 }, { x: 406, y: 376 }] }),
  measurement({ id: 2, label: "auto: 높이", points: [{ x: 319, y: 180 }, { x: 319, y: 639 }] }),
  measurement({ id: 3, label: "auto: 간격", points: [{ x: 319, y: 420 }, { x: 679, y: 420 }] }),
  measurement({
    id: 4,
    label: "auto: 바닥 곡률 반경",
    measurement_type: "curvature",
    points: [{ x: 257, y: 629 }, { x: 319, y: 639 }, { x: 381, y: 629 }],
    value: 39.44,
  }),
  measurement({
    id: 5,
    label: "auto: 좌측 측벽 각도",
    measurement_type: "angle",
    points: [{ x: 218, y: 547 }, { x: 218, y: 272 }, { x: 242, y: 272 }],
    value: 4.99,
    unit: "deg",
  }),
  measurement({
    id: 6,
    label: "auto: 우측 측벽 각도",
    measurement_type: "angle",
    points: [{ x: 420, y: 547 }, { x: 420, y: 272 }, { x: 397, y: 272 }],
    value: 4.78,
    unit: "deg",
  }),
].map((item) => ({ ...item, measurement_method: "auto", source: "auto", confidence: 0.9 }));

function renderOverlay(props: Partial<Parameters<typeof MeasurementOverlay>[0]> = {}) {
  return render(
    <svg>
      <MeasurementOverlay
        width={SIZE.width}
        height={SIZE.height}
        original={ORIGINAL}
        measurements={AUTO_SET}
        selectedId={null}
        draft={[]}
        draftType="length"
        {...props}
      />
    </svg>,
  );
}

function group(id: number): SVGGElement {
  return document.querySelector(`g[data-measurement-id="${id}"]`)!;
}

describe("MeasurementOverlay", () => {
  it("draws the measured arc of a curvature, never the whole fitted circle", () => {
    renderOverlay();
    const curvature = group(4);

    // A radius of ~197 original px would put a full circle over the entire
    // structure; only the arc between the three placed points is drawn.
    expect(curvature.querySelectorAll("circle.measurement-shape")).toHaveLength(0);
    const arc = curvature.querySelector("path.measurement-shape")!;
    expect(arc.getAttribute("d")).toMatch(/^M /);
    const samples = arc.getAttribute("d")!.split(" L ").length;
    expect(samples).toBeGreaterThan(8);
  });

  it("shows the radius a curvature value is derived from", () => {
    renderOverlay();

    expect(group(4).querySelector("line.radius-line")).toBeInTheDocument();
  });

  it("leaves every drawn shape unfilled", () => {
    // A filled shape hides the image and everything drawn before it; the class
    // is what keeps `fill: none` from being overridden by a broader rule.
    renderOverlay();
    for (const shape of document.querySelectorAll(".measurement-shape")) {
      expect(shape).toHaveClass("measurement-shape");
    }
    expect(document.querySelectorAll("path.measurement-shape").length).toBeGreaterThan(0);
  });

  it("marks auto geometry as auto so it is never read as verified", () => {
    renderOverlay();

    expect(group(1)).toHaveAttribute("data-source", "auto");
    expect(group(1).querySelector("line.measurement-shape")).toHaveClass("auto");
  });

  it("draws a derived angle arm as a reference point, not a placed one", () => {
    renderOverlay();
    const vertical = group(5).querySelectorAll("circle.measurement-point.reference");

    expect(vertical).toHaveLength(2);
    expect(group(5).querySelectorAll("circle.measurement-point:not(.reference)")).toHaveLength(1);
  });

  it("keeps six auto captions apart and on the image", () => {
    renderOverlay();
    const plates = [...document.querySelectorAll("rect.caption-plate")].map((plate) => ({
      x: Number(plate.getAttribute("x")),
      y: Number(plate.getAttribute("y")),
      width: Number(plate.getAttribute("width")),
      height: Number(plate.getAttribute("height")),
    }));

    expect(plates).toHaveLength(6);
    for (const plate of plates) {
      expect(plate.x).toBeGreaterThanOrEqual(0);
      expect(plate.y).toBeGreaterThanOrEqual(0);
      expect(plate.x + plate.width).toBeLessThanOrEqual(SIZE.width);
      expect(plate.y + plate.height).toBeLessThanOrEqual(SIZE.height);
    }
    for (let i = 0; i < plates.length; i += 1) {
      for (let j = i + 1; j < plates.length; j += 1) {
        const a = plates[i];
        const b = plates[j];
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x ||
          a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("drops the extractor's own prefix from a caption but keeps the value", () => {
    renderOverlay();

    expect(group(4).querySelector("text")).toHaveTextContent("바닥 곡률 반경 · 39.44nm");
  });

  it("hides captions when they are switched off", () => {
    renderOverlay({ showLabels: false });

    expect(screen.queryAllByTestId("measurement-label")).toHaveLength(0);
    expect(document.querySelectorAll("g[data-measurement-id]")).toHaveLength(6);
  });

  it("draws only the selected measurement when asked", () => {
    renderOverlay({ selectedId: 4, onlySelected: true });

    expect(document.querySelectorAll("g[data-measurement-id]")).toHaveLength(1);
    expect(group(4)).toBeInTheDocument();
  });

  it("dims the rest and paints the selected one last", () => {
    renderOverlay({ selectedId: 4 });
    const groups = [...document.querySelectorAll("g[data-measurement-id]")];

    expect(groups[groups.length - 1]).toBe(group(4));
    expect(group(4)).toHaveAttribute("opacity", "1");
    expect(group(1)).toHaveAttribute("opacity", "0.45");
    expect(group(4).querySelector(".selection-halo")).toBeInTheDocument();
  });

  it("gives the measurement under correction a handle on every point", () => {
    renderOverlay({ selectedId: 5, editingId: 5 });
    const handles = screen.getAllByTestId("adjust-handle");

    expect(handles).toHaveLength(3);
    // Focusable and named, so a point can be nudged without a mouse.
    expect(handles[0]).toHaveAttribute("tabindex", "0");
    expect(handles[0].getAttribute("aria-label")).toContain("1번째 점");
  });

  it("puts no handles on a measurement that is only selected", () => {
    renderOverlay({ selectedId: 5 });

    expect(screen.queryAllByTestId("adjust-handle")).toHaveLength(0);
  });

  it("follows the cursor with the shape while a measurement is drawn", () => {
    // Two placed points of an angle plus the cursor: the operator sees the
    // angle they are about to place instead of three unconnected dots.
    renderOverlay({
      measurements: [],
      draft: [{ x: 200, y: 400 }, { x: 200, y: 200 }],
      draftType: "angle",
      draftCursor: { x: 400, y: 200 },
    });

    expect(screen.getByTestId("measurement-draft-shape")).toBeInTheDocument();
    // Still only the two placed points carry a marker.
    expect(document.querySelectorAll("circle.draft-point")).toHaveLength(2);
  });

  it("drops the cursor preview once the last point is placed", () => {
    renderOverlay({
      measurements: [],
      draft: [{ x: 100, y: 100 }, { x: 400, y: 400 }],
      draftType: "length",
      draftCursor: { x: 900, y: 700 },
    });
    const line = document.querySelector("g[data-testid='measurement-draft-shape'] line")!;

    // The shape spans the two placed points, not the stale cursor.
    expect(Number(line.getAttribute("x2"))).toBeCloseTo(200, 5);
    expect(Number(line.getAttribute("y2"))).toBeCloseTo(200, 5);
  });

  it("draws the placed points of an incomplete draft without a shape", () => {
    renderOverlay({ measurements: [], draft: [{ x: 100, y: 100 }] });

    expect(screen.queryByTestId("measurement-draft-shape")).not.toBeInTheDocument();
    expect(document.querySelectorAll("circle.draft-point")).toHaveLength(1);
  });

  it("draws the draft shape once both points are placed", () => {
    renderOverlay({ measurements: [], draft: [{ x: 100, y: 100 }, { x: 400, y: 400 }] });

    expect(screen.getByTestId("measurement-draft-shape")).toBeInTheDocument();
    expect(document.querySelectorAll("circle.draft-point")).toHaveLength(2);
  });
});
