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

/**
 * Largest coordinate still inside the image.
 *
 * Valid points satisfy `0 <= x < pixel_width`, so the far edge itself is out of
 * bounds: a drag released past it has to land just inside, not on it, or the
 * server rejects the whole correction over a pixel the operator cannot see.
 */
const EDGE_EPSILON = 1e-6;

/**
 * Map a pointer position to original pixels, pulling a drag that left the image
 * back to its nearest edge instead of discarding it.
 *
 * Unlike {@link toOriginalPoint} -- which rejects a click outside the image, so
 * the surrounding viewer chrome never becomes a measurement coordinate -- this
 * is for dragging: the pointer routinely runs past the edge mid-gesture, and
 * the handle should follow it to the border rather than stop responding.
 */
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
    x: Math.min(
      clampedX * original.width / rendered.width,
      original.width - EDGE_EPSILON,
    ),
    y: Math.min(
      clampedY * original.height / rendered.height,
      original.height - EDGE_EPSILON,
    ),
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
