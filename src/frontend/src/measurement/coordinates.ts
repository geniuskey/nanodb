export interface Point {
  x: number;
  y: number;
}

export interface RenderedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OriginalSize {
  width: number;
  height: number;
}

export function toOriginalPoint(
  clientPoint: Point,
  rendered: RenderedRect,
  original: OriginalSize,
): Point | null {
  if (
    rendered.width <= 0 ||
    rendered.height <= 0 ||
    original.width <= 0 ||
    original.height <= 0
  ) return null;
  const localX = clientPoint.x - rendered.left;
  const localY = clientPoint.y - rendered.top;
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= rendered.width ||
    localY >= rendered.height
  ) return null;
  return {
    x: localX * original.width / rendered.width,
    y: localY * original.height / rendered.height,
  };
}

export function toOriginalPointClamped(
  clientPoint: Point,
  rendered: RenderedRect,
  original: OriginalSize,
): Point | null {
  if (
    rendered.width <= 0 ||
    rendered.height <= 0 ||
    original.width <= 0 ||
    original.height <= 0
  ) return null;
  const clampedX = Math.min(Math.max(clientPoint.x - rendered.left, 0), rendered.width);
  const clampedY = Math.min(Math.max(clientPoint.y - rendered.top, 0), rendered.height);
  return {
    x: clampedX * original.width / rendered.width,
    y: clampedY * original.height / rendered.height,
  };
}

export function toRenderedPoint(
  originalPoint: Point,
  rendered: RenderedRect,
  original: OriginalSize,
): Point {
  return {
    x: originalPoint.x * rendered.width / original.width,
    y: originalPoint.y * rendered.height / original.height,
  };
}
