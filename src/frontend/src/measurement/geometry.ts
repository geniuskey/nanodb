import type { MeasurementType, Point } from "../api/types";

/** How many points the operator places for each measurement type. */
export const POINT_COUNT: Record<MeasurementType, number> = {
  length: 2,
  angle: 3,
  curvature: 3,
};

/** Unit each measurement type reports its value in. */
export const UNIT_BY_TYPE: Record<MeasurementType, string> = {
  length: "nm",
  angle: "deg",
  curvature: "nm",
};

export const TYPE_LABEL: Record<MeasurementType, string> = {
  length: "길이",
  angle: "각도",
  curvature: "곡률",
};

/**
 * Palette used to draw each saved measurement in its own colour, so a row in
 * the table and its shape on the image can be matched by eye. Assigned by id so
 * a measurement keeps its colour regardless of list order.
 */
export const MEASUREMENT_COLORS = [
  "#8b84ff",
  "#ff8fab",
  "#4bd6c4",
  "#ffb14b",
  "#7ab8ff",
  "#c78bff",
  "#ff7a5c",
  "#6ee787",
];

export function measurementColor(id: number): string {
  const size = MEASUREMENT_COLORS.length;
  return MEASUREMENT_COLORS[((id % size) + size) % size];
}

/** Human hint for how each type is drawn, shown while placing points. */
export const DRAW_HINT: Record<MeasurementType, string> = {
  length: "두 점을 찍어 선분을 그립니다.",
  angle: "꼭짓점을 먼저 찍고, 두 변의 끝점을 차례로 찍습니다.",
  curvature: "호 위의 세 점을 찍으면 원을 맞춰 반지름을 잽니다.",
};

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export interface PreviewResult {
  value: number;
  unit: string;
}

/**
 * Client-side preview of a drawn measurement, mirroring the server formulas so
 * the operator sees a value before saving. The server stays authoritative: the
 * saved value is whatever it recomputes. Returns null when the points are
 * degenerate (identical, collinear) or incomplete.
 */
export function previewValue(
  measurementType: MeasurementType,
  points: Point[],
  calibrationNmPerPixel: number,
): PreviewResult | null {
  if (points.length !== POINT_COUNT[measurementType]) return null;
  if (measurementType === "length") {
    const px = distance(points[0], points[1]);
    if (px <= 0) return null;
    return { value: px * calibrationNmPerPixel, unit: "nm" };
  }
  if (measurementType === "angle") {
    const [vertex, a, b] = points;
    const ax = a.x - vertex.x;
    const ay = a.y - vertex.y;
    const bx = b.x - vertex.x;
    const by = b.y - vertex.y;
    const lenA = Math.hypot(ax, ay);
    const lenB = Math.hypot(bx, by);
    if (lenA <= 0 || lenB <= 0) return null;
    let cosine = (ax * bx + ay * by) / (lenA * lenB);
    cosine = Math.max(-1, Math.min(1, cosine));
    return { value: (Math.acos(cosine) * 180) / Math.PI, unit: "deg" };
  }
  const radius = circumradiusPx(points);
  if (radius === null) return null;
  return { value: radius * calibrationNmPerPixel, unit: "nm" };
}

/** Circumradius of three points in pixels, or null when they are collinear. */
export function circumradiusPx(points: Point[]): number | null {
  const [p1, p2, p3] = points;
  const area2 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  if (Math.abs(area2) <= 1e-9) return null;
  const a = distance(p1, p2);
  const b = distance(p2, p3);
  const c = distance(p3, p1);
  return (a * b * c) / (2 * Math.abs(area2));
}

/** Centre of the circle through three points, or null when they are collinear. */
export function circleCenter(points: Point[]): Point | null {
  const [p1, p2, p3] = points;
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
  if (Math.abs(d) <= 1e-9) return null;
  const p1sq = p1.x * p1.x + p1.y * p1.y;
  const p2sq = p2.x * p2.x + p2.y * p2.y;
  const p3sq = p3.x * p3.x + p3.y * p3.y;
  const ux = (p1sq * (p2.y - p3.y) + p2sq * (p3.y - p1.y) + p3sq * (p1.y - p2.y)) / d;
  const uy = (p1sq * (p3.x - p2.x) + p2sq * (p1.x - p3.x) + p3sq * (p2.x - p1.x)) / d;
  return { x: ux, y: uy };
}

/** Format a value with its unit for display (2 decimals). */
export function formatValue(value: number, unit: string): string {
  return `${value.toFixed(2)}${unit === "deg" ? "°" : unit}`;
}

/**
 * Shorter form of {@link formatValue} for captions drawn on the image.
 *
 * A caption competes with the structure underneath it for space, and two
 * decimals on a radius of several thousand nanometres are noise rather than
 * precision. The tables keep the full value; this only shortens what is drawn.
 */
export function formatOverlayValue(value: number, unit: string): string {
  const magnitude = Math.abs(value);
  const digits = magnitude >= 1000 ? 0 : magnitude >= 100 ? 1 : 2;
  return `${value.toFixed(digits)}${unit === "deg" ? "°" : unit}`;
}
