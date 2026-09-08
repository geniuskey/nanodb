import { toRenderedPoint, type OriginalSize, type Point, type RenderedRect } from "./coordinates";
import { circleCenter, circumradiusPx } from "./geometry";

/**
 * Drawing geometry for a curvature measurement.
 *
 * A curvature stores three points on an arc and reports the radius of the
 * circle fitted through them. Drawing that whole circle is misleading: the
 * radius of an auto-extracted trench bottom is several times the width of the
 * structure, so the circle sweeps across unrelated features and its centre
 * often falls outside the image. What the operator needs to see is the arc that
 * was actually measured and the radius that was derived from it, so this
 * module produces exactly those two things.
 *
 * The arc is emitted as a polyline sampled in *original* pixels and mapped
 * point by point into rendered space. That keeps it correct even if the two
 * axes are not scaled identically, which an SVG arc segment could not express.
 */

/** Angular spacing of arc samples. Small enough to read as a smooth curve. */
const SAMPLE_STEP = Math.PI / 90;
const MIN_SAMPLES = 8;
const MAX_SAMPLES = 240;

export interface ArcGeometry {
  /** The measured arc, in rendered pixels. */
  polyline: Point[];
  /** Middle of the arc, where the radius line starts. */
  midpoint: Point;
  /** Centre of the fitted circle, in rendered pixels; may be off-image. */
  center: Point;
  /** Unit vector at the midpoint pointing away from the centre. */
  outward: Point;
  /** Fitted radius in original pixels — the quantity the value comes from. */
  radiusPx: number;
}

function normalize(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

/**
 * Build the arc through `points` (in original pixels) for display.
 *
 * Returns null when the points are collinear or the mapping is degenerate — the
 * same condition under which no radius can be derived, so nothing is drawn.
 */
export function arcGeometry(
  points: Point[],
  rendered: RenderedRect,
  original: OriginalSize,
): ArcGeometry | null {
  if (points.length < 3) return null;
  if (original.width <= 0 || original.height <= 0) return null;
  if (rendered.width <= 0 || rendered.height <= 0) return null;
  const center = circleCenter(points);
  const radiusPx = circumradiusPx(points);
  if (!center || radiusPx === null || radiusPx <= 0) return null;

  const [first, middle, last] = points;
  const startAngle = Math.atan2(first.y - center.y, first.x - center.x);
  const throughAngle = normalize(
    Math.atan2(middle.y - center.y, middle.x - center.x) - startAngle,
  );
  const endAngle = normalize(Math.atan2(last.y - center.y, last.x - center.x) - startAngle);
  // Sweep the way that passes through the middle point: that is the arc the
  // operator (or the extractor) actually sampled.
  const forward = throughAngle <= endAngle;
  const span = forward ? endAngle : endAngle - Math.PI * 2;
  if (span === 0) return null;

  const samples = Math.min(
    MAX_SAMPLES,
    Math.max(MIN_SAMPLES, Math.ceil(Math.abs(span) / SAMPLE_STEP)),
  );
  const at = (t: number): Point => {
    const angle = startAngle + span * t;
    return toRenderedPoint(
      {
        x: center.x + radiusPx * Math.cos(angle),
        y: center.y + radiusPx * Math.sin(angle),
      },
      rendered,
      original,
    );
  };
  const polyline: Point[] = [];
  for (let index = 0; index <= samples; index += 1) polyline.push(at(index / samples));

  const midpoint = at(0.5);
  const renderedCenter = toRenderedPoint(center, rendered, original);
  const dx = midpoint.x - renderedCenter.x;
  const dy = midpoint.y - renderedCenter.y;
  const length = Math.hypot(dx, dy);
  return {
    polyline,
    midpoint,
    center: renderedCenter,
    outward: length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: -1 },
    radiusPx,
  };
}

/** An SVG path string for a polyline. */
export function polylinePath(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

/**
 * Trim `a`→`b` to the part inside `box` (Liang–Barsky), or null when the whole
 * segment lies outside it.
 *
 * The radius line of a wide arc runs to a centre that is often far off-image;
 * clipping it keeps the direction visible without stroking a segment thousands
 * of pixels long.
 */
export function clipToBox(
  a: Point,
  b: Point,
  box: { width: number; height: number },
): [Point, Point] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: Array<[number, number]> = [
    [-dx, a.x],
    [dx, box.width - a.x],
    [-dy, a.y],
    [dy, box.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}
