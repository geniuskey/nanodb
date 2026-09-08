import type { ReactNode } from "react";

import type { MeasurementType, MeasurementView } from "../api/types";
import { arcGeometry, clipToBox, polylinePath } from "./arc";
import { formatOverlayValue, measurementColor } from "./geometry";
import { layoutLabels, truncate, type LabelRequest, type PlacedLabel } from "./labels";
import { toRenderedPoint, type OriginalSize, type Point, type RenderedRect } from "./coordinates";

interface Props {
  width: number;
  height: number;
  original: OriginalSize;
  measurements: MeasurementView[];
  selectedId: number | null;
  draft: Point[];
  draftType: MeasurementType;
  /** Draw the value captions on the image. Off declutters a crowded region. */
  showLabels?: boolean;
  /** Draw only the selected measurement, so one shape can be read on its own. */
  onlySelected?: boolean;
}

/** Length in screen pixels of the T-shaped end caps drawn on a length segment. */
const CAP = 7;
/** Radius of a point marker, in screen pixels. */
const DOT = 3.5;
const DOT_SELECTED = 5;
/** Half-length of the arms of the cross marking a fitted circle centre. */
const CENTRE_CROSS = 5;
/** Longest measurement name drawn on the image before it is elided. */
const MAX_NAME_CHARS = 14;
/** Non-selected shapes fade to this opacity while one measurement is selected. */
const DIMMED = 0.45;

interface ShapeStyle {
  className: string;
  color?: string;
  /** Auto measurements are dashed: not human-verified, and visibly so. */
  auto?: boolean;
  selected?: boolean;
}

/** Everything the overlay needs to draw one measurement and caption it. */
interface Drawing {
  shape: ReactNode;
  markers: ReactNode;
  /** Point on the shape the caption belongs to. */
  anchor: Point;
  /** Preferred direction to push the caption away from the shape. */
  direction: Point;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Unit vector perpendicular to a→b, or null when the points coincide. */
function perpendicular(a: Point, b: Point): Point | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  return { x: -dy / length, y: dx / length };
}

function unitFrom(from: Point, to: Point): Point | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  return { x: dx / length, y: dy / length };
}

/** Point the caption upwards when either side would do: that is where eyes go. */
function preferUpwards(direction: Point): Point {
  return direction.y <= 0 ? direction : { x: -direction.x, y: -direction.y };
}

function shapeClass(style: ShapeStyle): string {
  return `${style.className} measurement-shape${style.auto ? " auto" : ""}`;
}

function strokeStyle(style: ShapeStyle) {
  return style.color ? { stroke: style.color } : undefined;
}

function Dot({ at, color, selected, reference }: {
  at: Point;
  color?: string;
  selected?: boolean;
  reference?: boolean;
}) {
  // A reference point is a construction aid rather than something measured --
  // the vertical arm of an auto sidewall angle, for one -- so it is drawn
  // hollow and small, never as a placed point.
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={reference ? DOT : selected ? DOT_SELECTED : DOT}
      className={reference ? "measurement-point reference" : "measurement-point"}
      style={reference ? { stroke: color } : { fill: color }}
    />
  );
}

/** A length segment with T-shaped end caps (perpendicular ticks). */
function lengthDrawing(points: Point[], style: ShapeStyle): Drawing {
  const [start, end] = points;
  const normal = perpendicular(start, end);
  const className = shapeClass(style);
  const stroke = strokeStyle(style);
  return {
    shape: (
      <>
        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={className} style={stroke} />
        {normal &&
          [start, end].map((point, index) => (
            <line
              key={`cap-${index}`}
              x1={point.x - normal.x * CAP}
              y1={point.y - normal.y * CAP}
              x2={point.x + normal.x * CAP}
              y2={point.y + normal.y * CAP}
              className={className}
              style={stroke}
            />
          ))}
      </>
    ),
    markers: (
      <>
        <Dot at={start} color={style.color} selected={style.selected} />
        <Dot at={end} color={style.color} selected={style.selected} />
      </>
    ),
    anchor: midpoint(start, end),
    // Beside the segment rather than on it, so the line stays readable.
    direction: normal ? preferUpwards(normal) : { x: 0, y: -1 },
  };
}

/**
 * Two arms from the vertex, plus a wedge marking the measured angle.
 *
 * The wedge radius follows the shorter arm instead of being fixed, so the mark
 * never spills past the arms it belongs to on a small structure.
 */
function angleDrawing(points: Point[], style: ShapeStyle): Drawing {
  const [vertex, armA, armB] = points;
  const className = shapeClass(style);
  const stroke = strokeStyle(style);
  const unitA = unitFrom(vertex, armA);
  const unitB = unitFrom(vertex, armB);
  const arms = (
    <>
      <line x1={vertex.x} y1={vertex.y} x2={armA.x} y2={armA.y} className={className} style={stroke} />
      <line x1={vertex.x} y1={vertex.y} x2={armB.x} y2={armB.y} className={className} style={stroke} />
    </>
  );
  const markers = (
    <>
      <Dot at={vertex} color={style.color} selected={style.selected} />
      <Dot at={armA} color={style.color} reference />
      <Dot at={armB} color={style.color} reference />
    </>
  );
  if (!unitA || !unitB) {
    return { shape: arms, markers, anchor: vertex, direction: { x: 0, y: -1 } };
  }
  const shortest = Math.min(
    Math.hypot(armA.x - vertex.x, armA.y - vertex.y),
    Math.hypot(armB.x - vertex.x, armB.y - vertex.y),
  );
  const radius = Math.min(34, Math.max(12, shortest * 0.4));
  const arcStart = { x: vertex.x + radius * unitA.x, y: vertex.y + radius * unitA.y };
  const arcEnd = { x: vertex.x + radius * unitB.x, y: vertex.y + radius * unitB.y };
  // Sweep the short way around, so the mark sits inside the measured angle.
  let delta = Math.atan2(unitB.y, unitB.x) - Math.atan2(unitA.y, unitA.x);
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const sweep = delta > 0 ? 1 : 0;
  const arc = `A ${radius} ${radius} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.y}`;
  const bisector = unitFrom(
    { x: 0, y: 0 },
    { x: unitA.x + unitB.x, y: unitA.y + unitB.y },
  ) ?? { x: -unitA.y, y: unitA.x };
  return {
    shape: (
      <>
        {/* The filled wedge reads at a glance even when the angle is a few
            degrees and the arc alone would be a hairline. */}
        <path
          d={`M ${vertex.x} ${vertex.y} L ${arcStart.x} ${arcStart.y} ${arc} Z`}
          className="measurement-wedge"
          style={style.color ? { fill: style.color } : undefined}
        />
        {arms}
        <path
          d={`M ${arcStart.x} ${arcStart.y} ${arc}`}
          className={className}
          style={stroke}
        />
      </>
    ),
    markers,
    anchor: { x: vertex.x + bisector.x * radius, y: vertex.y + bisector.y * radius },
    direction: bisector,
  };
}

/**
 * The measured arc and the radius derived from it.
 *
 * Drawing the whole fitted circle would bury the structure under a ring several
 * times its size, so only the arc between the three stored points is stroked,
 * with a dashed radius line running towards the fitted centre (trimmed at the
 * image edge when the centre falls outside it).
 */
function curvatureDrawing(
  originalPoints: Point[],
  renderedPoints: Point[],
  rendered: RenderedRect,
  original: OriginalSize,
  style: ShapeStyle,
): Drawing {
  const className = shapeClass(style);
  const stroke = strokeStyle(style);
  const markers = (
    <>
      {renderedPoints.map((point, index) => (
        <Dot key={`arc-${index}`} at={point} color={style.color} selected={style.selected} />
      ))}
    </>
  );
  const arc = arcGeometry(originalPoints, rendered, original);
  if (!arc) {
    // Collinear points have no radius; show what was placed instead of a shape
    // that would imply a curvature nobody measured.
    return {
      shape: (
        <path d={polylinePath(renderedPoints)} className={className} style={stroke} />
      ),
      markers,
      anchor: renderedPoints[1] ?? renderedPoints[0],
      direction: { x: 0, y: -1 },
    };
  }
  const box = { width: rendered.width, height: rendered.height };
  const radiusLine = clipToBox(arc.midpoint, arc.center, box);
  const centreOnImage =
    arc.center.x >= 0 &&
    arc.center.y >= 0 &&
    arc.center.x <= rendered.width &&
    arc.center.y <= rendered.height;
  return {
    shape: (
      <>
        {radiusLine && (
          <line
            x1={radiusLine[0].x}
            y1={radiusLine[0].y}
            x2={radiusLine[1].x}
            y2={radiusLine[1].y}
            className={`${className} radius-line`}
            style={stroke}
          />
        )}
        <path d={polylinePath(arc.polyline)} className={className} style={stroke} />
      </>
    ),
    markers: (
      <>
        {markers}
        {centreOnImage && (
          <g className="measurement-centre" style={stroke} data-testid="curvature-centre">
            <line
              x1={arc.center.x - CENTRE_CROSS}
              y1={arc.center.y}
              x2={arc.center.x + CENTRE_CROSS}
              y2={arc.center.y}
            />
            <line
              x1={arc.center.x}
              y1={arc.center.y - CENTRE_CROSS}
              x2={arc.center.x}
              y2={arc.center.y + CENTRE_CROSS}
            />
          </g>
        )}
      </>
    ),
    anchor: arc.midpoint,
    // Outside the curve: for a trench bottom or a rounded top that is the empty
    // side, so the caption never lands on the structure being measured.
    direction: arc.outward,
  };
}

function describe(
  measurementType: MeasurementType,
  originalPoints: Point[],
  renderedPoints: Point[],
  rendered: RenderedRect,
  original: OriginalSize,
  style: ShapeStyle,
): Drawing | null {
  if (measurementType === "length" && renderedPoints.length >= 2) {
    return lengthDrawing(renderedPoints, style);
  }
  if (measurementType === "angle" && renderedPoints.length >= 3) {
    return angleDrawing(renderedPoints, style);
  }
  if (measurementType === "curvature" && renderedPoints.length >= 3) {
    return curvatureDrawing(originalPoints, renderedPoints, rendered, original, style);
  }
  return null;
}

/** The caption chip: a dark plate so the text survives a bright TEM background. */
function Caption({ placed, color, selected, auto }: {
  placed: PlacedLabel;
  color: string;
  selected: boolean;
  auto: boolean;
}) {
  const left = placed.center.x - placed.width / 2;
  const top = placed.center.y - placed.height / 2;
  return (
    <g className={selected ? "measurement-caption selected" : "measurement-caption"}>
      {placed.leader && (
        <line
          x1={placed.anchor.x}
          y1={placed.anchor.y}
          x2={placed.center.x}
          y2={placed.center.y}
          className="caption-leader"
          style={{ stroke: color }}
        />
      )}
      <rect
        x={left}
        y={top}
        width={placed.width}
        height={placed.height}
        rx={placed.height / 2}
        className={auto ? "caption-plate auto" : "caption-plate"}
        style={{ stroke: color }}
      />
      <text
        x={placed.center.x}
        y={placed.center.y}
        className="measurement-label"
        style={{ fill: color }}
        data-testid="measurement-label"
      >
        {placed.text}
      </text>
    </g>
  );
}

export function MeasurementOverlay({
  width,
  height,
  original,
  measurements,
  selectedId,
  draft,
  draftType,
  showLabels = true,
  onlySelected = false,
}: Props) {
  const rendered: RenderedRect = { left: 0, top: 0, width, height };
  const toRendered = (point: Point) => toRenderedPoint(point, rendered, original);
  const draftPoints = draft.map(toRendered);

  const shown =
    onlySelected && selectedId !== null
      ? measurements.filter((measurement) => measurement.id === selectedId)
      : measurements;

  // Draw the selected measurement last so nothing covers it, and dim the rest
  // so a single shape can be read out of a crowded auto-extracted set.
  const ordered = [...shown].sort((a, b) => {
    const rank = (id: number) => (id === selectedId ? 1 : 0);
    return rank(a.id) - rank(b.id);
  });

  const drawings = ordered.map((measurement) => {
    const selected = measurement.id === selectedId;
    const color = measurementColor(measurement.id);
    const style: ShapeStyle = {
      className: selected ? "saved-line selected" : "saved-line",
      color,
      auto: measurement.source === "auto",
      selected,
    };
    const renderedPoints = measurement.points.map(toRendered);
    return {
      measurement,
      selected,
      color,
      drawing: describe(
        measurement.measurement_type,
        measurement.points,
        renderedPoints,
        rendered,
        original,
        style,
      ),
    };
  });

  const requests: LabelRequest[] = showLabels
    ? drawings.flatMap(({ measurement, selected, drawing }) => {
        const name = measurement.label?.trim();
        if (!name || !drawing) return [];
        return [{
          key: measurement.id,
          // The extractor prefixes its own labels with "auto:"; the dashed
          // shape and plate already say that, so the caption keeps the name.
          // Truncate only the name: the value is the point of the caption and
          // must never be the half that gets elided.
          text: `${truncate(name.replace(/^auto:\s*/i, ""), MAX_NAME_CHARS)} · ${formatOverlayValue(measurement.value, measurement.unit)}`,
          anchor: drawing.anchor,
          direction: drawing.direction,
          priority: selected ? 0 : 1,
        }];
      })
    : [];
  const placements = new Map(
    layoutLabels(requests, { width, height }).map((placed) => [placed.key, placed]),
  );

  const draftDrawing = describe(
    draftType,
    draft,
    draftPoints,
    rendered,
    original,
    { className: "draft-line" },
  );

  return (
    <svg
      className="measurement-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="저장 및 작성 중인 측정"
      data-testid="measurement-overlay"
    >
      {drawings.map(({ measurement, selected, color, drawing }) => {
        if (!drawing) return null;
        const placed = placements.get(measurement.id);
        return (
          <g
            key={measurement.id}
            data-measurement-id={measurement.id}
            data-source={measurement.source}
            opacity={selectedId !== null && !selected ? DIMMED : 1}
          >
            {/* A white under-stroke marks the selection while each measurement
                keeps the colour that matches its row in the table. */}
            {selected && <g className="selection-halo">{drawing.shape}</g>}
            {drawing.shape}
            {drawing.markers}
            {placed && (
              <Caption
                placed={placed}
                color={color}
                selected={selected}
                auto={measurement.source === "auto"}
              />
            )}
          </g>
        );
      })}
      {draftDrawing && (
        // Markers come from `draftPoints` below, which paints every point
        // placed so far -- including an incomplete draft the shape cannot use.
        <g data-testid="measurement-draft-shape">{draftDrawing.shape}</g>
      )}
      {draftPoints.map((point, index) => (
        <circle
          key={`draft-${index}`}
          cx={point.x}
          cy={point.y}
          r="5"
          className="measurement-point draft-point"
        />
      ))}
    </svg>
  );
}
