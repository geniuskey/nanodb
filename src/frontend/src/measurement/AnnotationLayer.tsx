import { PointerEvent as ReactPointerEvent, useId } from "react";

import type { AnnotationView, ShapeKind } from "../api/types";
import { toRenderedPoint, type OriginalSize, type Point } from "./coordinates";

export interface DraftShape {
  kind: ShapeKind;
  start: Point;
  end: Point;
}

interface Props {
  width: number;
  height: number;
  original: OriginalSize;
  annotations: AnnotationView[];
  draft: DraftShape | null;
  interactive: boolean;
  selectedId: number | null;
  /** Select the shape's table row by clicking the shape itself (ANN-006). */
  onSelect?: (id: number) => void;
  onPointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<SVGSVGElement>) => void;
}

function radius(center: Point, edge: Point): number {
  return Math.hypot(edge.x - center.x, edge.y - center.y);
}

function labelPoint(kind: ShapeKind, start: Point, end: Point): Point {
  // Circle: label above the centre; arrow: label at the tail.
  if (kind === "circle") return { x: start.x, y: start.y - radius(start, end) - 6 };
  return { x: start.x, y: start.y - 6 };
}

export function AnnotationLayer({
  width,
  height,
  original,
  annotations,
  draft,
  interactive,
  selectedId,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  const rendered = { left: 0, top: 0, width, height };
  const arrowHead = useId();

  function renderShape(
    kind: ShapeKind,
    start: Point,
    end: Point,
    className: string,
    key: string,
    number?: number,
    id?: number,
  ) {
    const startR = toRenderedPoint(start, rendered, original);
    const endR = toRenderedPoint(end, rendered, original);
    const label = toRenderedPoint(labelPoint(kind, start, end), rendered, original);
    // A saved shape stays clickable even when the layer itself is inert, so a
    // shape and its row can be selected from either side. CSS limits the hit
    // area to the stroke, keeping the image below clickable for measuring.
    const selectable = id !== undefined && onSelect !== undefined;
    return (
      <g
        key={key}
        data-annotation-id={id}
        className={selectable ? "annotation-shape selectable" : "annotation-shape"}
        onClick={selectable ? () => onSelect(id) : undefined}
      >
        {kind === "arrow" ? (
          <line
            x1={startR.x}
            y1={startR.y}
            x2={endR.x}
            y2={endR.y}
            className={`annotation-arrow ${className}`}
            markerEnd={`url(#${arrowHead})`}
          />
        ) : (
          <circle
            cx={startR.x}
            cy={startR.y}
            r={radius(startR, endR)}
            className={`annotation-circle ${className}`}
          />
        )}
        {number !== undefined && (
          <text x={label.x} y={label.y} className="annotation-number">
            {number}
          </text>
        )}
      </g>
    );
  }

  return (
    <svg
      className="annotation-overlay"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      aria-label="그린 도형"
      data-testid="annotation-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <defs>
        <marker
          id={arrowHead}
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L8,3 L0,6 Z" className="annotation-arrowhead" />
        </marker>
      </defs>
      {annotations.map((annotation, index) =>
        renderShape(
          annotation.kind,
          { x: annotation.start_x, y: annotation.start_y },
          { x: annotation.end_x, y: annotation.end_y },
          annotation.id === selectedId ? "selected" : "",
          `annotation-${annotation.id}`,
          index + 1,
          annotation.id,
        ),
      )}
      {draft &&
        renderShape(draft.kind, draft.start, draft.end, "draft", "annotation-draft")}
    </svg>
  );
}
