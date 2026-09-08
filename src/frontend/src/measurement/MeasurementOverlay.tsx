import type { MeasurementType, MeasurementView } from "../api/types";
import {
  circleCenter,
  circumradiusPx,
  formatValue,
  measurementColor,
} from "./geometry";
import { toRenderedPoint, type OriginalSize, type Point } from "./coordinates";

interface Props {
  width: number;
  height: number;
  original: OriginalSize;
  measurements: MeasurementView[];
  selectedId: number | null;
  draft: Point[];
  draftType: MeasurementType;
}

/** Length in screen pixels of the T-shaped end caps drawn on a length segment. */
const CAP = 7;

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

/** A length segment with T-shaped end caps (perpendicular ticks). */
function LengthShape({
  points,
  className,
  color,
}: {
  points: Point[];
  className: string;
  color?: string;
}) {
  const [start, end] = points;
  const normal = perpendicular(start, end);
  const stroke = color ? { stroke: color } : undefined;
  return (
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
  );
}

/** Two arms from the vertex plus a small arc marking the measured angle. */
function AngleShape({
  points,
  className,
  color,
}: {
  points: Point[];
  className: string;
  color?: string;
}) {
  const stroke = color ? { stroke: color } : undefined;
  const [vertex, armA, armB] = points;
  const radius = 18;
  const angleA = Math.atan2(armA.y - vertex.y, armA.x - vertex.x);
  const angleB = Math.atan2(armB.y - vertex.y, armB.x - vertex.x);
  const arcStart = {
    x: vertex.x + radius * Math.cos(angleA),
    y: vertex.y + radius * Math.sin(angleA),
  };
  const arcEnd = {
    x: vertex.x + radius * Math.cos(angleB),
    y: vertex.y + radius * Math.sin(angleB),
  };
  // Sweep the short way around, so the drawn arc sits inside the measured angle.
  let delta = angleB - angleA;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  const sweep = delta > 0 ? 1 : 0;
  return (
    <>
      <line x1={vertex.x} y1={vertex.y} x2={armA.x} y2={armA.y} className={className} style={stroke} />
      <line x1={vertex.x} y1={vertex.y} x2={armB.x} y2={armB.y} className={className} style={stroke} />
      <path
        d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.y}`}
        className={className}
        style={stroke}
        fill="none"
      />
    </>
  );
}

/** The three placed points and the circle fitted through them. */
function CurvatureShape({
  points,
  original,
  rendered,
  className,
  color,
}: {
  points: Point[];
  original: OriginalSize;
  rendered: { left: number; top: number; width: number; height: number };
  className: string;
  color?: string;
}) {
  // Fit in original pixels (uniform scale), then convert centre and radius to
  // rendered space so the drawn circle matches the stored geometry.
  const centerOriginal = circleCenter(points);
  const radiusPx = circumradiusPx(points);
  const scale = original.width > 0 ? rendered.width / original.width : 0;
  return (
    <>
      {centerOriginal && radiusPx !== null && scale > 0 && (
        <circle
          cx={centerOriginal.x * scale}
          cy={centerOriginal.y * scale}
          r={radiusPx * scale}
          className={className}
          style={color ? { stroke: color } : undefined}
          fill="none"
        />
      )}
    </>
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
}: Props) {
  const rendered = { left: 0, top: 0, width, height };
  const toRendered = (point: Point) => toRenderedPoint(point, rendered, original);
  const draftPoints = draft.map(toRendered);

  return (
    <svg
      className="measurement-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="저장 및 작성 중인 측정"
      data-testid="measurement-overlay"
    >
      {measurements.map((measurement) => {
        const points = measurement.points.map(toRendered);
        const selected = measurement.id === selectedId;
        const lineClass = selected ? "saved-line selected" : "saved-line";
        const color = measurementColor(measurement.id);
        const caption = measurement.label?.trim();
        // The caption sits near the shape it belongs to, so a measurement and
        // the name of what it measures are read as one thing.
        const anchor =
          measurement.measurement_type === "angle"
            ? points[0]
            : midpoint(points[0], points[points.length - 1]);
        return (
          <g key={measurement.id} data-measurement-id={measurement.id}>
            {measurement.measurement_type === "length" && (
              <LengthShape points={points} className={lineClass} color={color} />
            )}
            {measurement.measurement_type === "angle" && (
              <AngleShape points={points} className={lineClass} color={color} />
            )}
            {measurement.measurement_type === "curvature" && (
              <CurvatureShape
                points={measurement.points}
                original={original}
                rendered={rendered}
                className={lineClass}
                color={color}
              />
            )}
            {points.map((point, index) => (
              <circle
                key={`p-${index}`}
                cx={point.x}
                cy={point.y}
                r={selected ? 6 : 4}
                style={{ fill: color }}
              />
            ))}
            {caption && (
              <text
                x={anchor.x}
                y={anchor.y - 8}
                className={selected ? "measurement-label selected" : "measurement-label"}
                style={{ fill: color }}
                data-testid="measurement-label"
              >
                {caption} · {formatValue(measurement.value, measurement.unit)}
              </text>
            )}
          </g>
        );
      })}
      {draftType === "length" && draftPoints.length === 2 && (
        <g data-testid="measurement-draft-shape">
          <LengthShape points={draftPoints} className="draft-line" />
        </g>
      )}
      {draftType === "angle" && draftPoints.length === 3 && (
        <g data-testid="measurement-draft-shape">
          <AngleShape points={draftPoints} className="draft-line" />
        </g>
      )}
      {draftType === "curvature" && draftPoints.length === 3 && (
        <g data-testid="measurement-draft-shape">
          <CurvatureShape
            points={draft}
            original={original}
            rendered={rendered}
            className="draft-line"
          />
        </g>
      )}
      {draftPoints.map((point, index) => (
        <circle
          key={`draft-${index}`}
          cx={point.x}
          cy={point.y}
          r="5"
          className="draft-point"
        />
      ))}
    </svg>
  );
}
