import type { MeasurementView } from "../api/types";
import { toRenderedPoint, type OriginalSize, type Point } from "./coordinates";

interface Props {
  width: number;
  height: number;
  original: OriginalSize;
  measurements: MeasurementView[];
  selectedId: number | null;
  draft: Point[];
}

export function MeasurementOverlay({
  width,
  height,
  original,
  measurements,
  selectedId,
  draft,
}: Props) {
  const rendered = { left: 0, top: 0, width, height };
  const draftPoints = draft.map((point) =>
    toRenderedPoint(point, rendered, original),
  );
  return (
    <svg
      className="measurement-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="저장 및 작성 중인 측정선"
      data-testid="measurement-overlay"
    >
      {measurements.map((measurement) => {
        const start = toRenderedPoint(
          { x: measurement.start_x, y: measurement.start_y },
          rendered,
          original,
        );
        const end = toRenderedPoint(
          { x: measurement.end_x, y: measurement.end_y },
          rendered,
          original,
        );
        const selected = measurement.id === selectedId;
        // The caption sits above the midpoint of the line it belongs to, so a
        // measurement and the name of what it measures are read as one thing.
        const caption = measurement.label?.trim();
        return (
          <g key={measurement.id} data-measurement-id={measurement.id}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={selected ? "saved-line selected" : "saved-line"}
            />
            <circle cx={start.x} cy={start.y} r={selected ? 6 : 4} />
            <circle cx={end.x} cy={end.y} r={selected ? 6 : 4} />
            {caption && (
              <text
                x={(start.x + end.x) / 2}
                y={(start.y + end.y) / 2 - 8}
                className={selected ? "measurement-label selected" : "measurement-label"}
                data-testid="measurement-label"
              >
                {caption}
              </text>
            )}
          </g>
        );
      })}
      {draftPoints.length === 2 && (
        <line
          x1={draftPoints[0].x}
          y1={draftPoints[0].y}
          x2={draftPoints[1].x}
          y2={draftPoints[1].y}
          className="draft-line"
          data-testid="measurement-draft-line"
        />
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
