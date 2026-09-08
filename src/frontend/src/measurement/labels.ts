import type { Point } from "./coordinates";

/**
 * Placement of the captions drawn on the image.
 *
 * Auto feature extraction puts up to six measurements on one structure, and
 * several of them share an anchor almost exactly (width and height cross at the
 * centre of the same region, the two sidewall angles sit on the same rows).
 * Captions pinned straight onto those anchors pile into an unreadable stack, so
 * the overlay lays them out globally instead: each caption starts at its
 * preferred offset and is pushed away until it no longer overlaps a caption
 * already placed, staying inside the image.
 *
 * The geometry is pure and deterministic so it can be unit tested without a DOM
 * (jsdom reports no text metrics, so widths are estimated from the text rather
 * than measured).
 */

/** Font size of a caption, in rendered pixels. Mirrors `.measurement-label`. */
export const LABEL_FONT_SIZE = 13;
/** Horizontal padding inside a caption chip. */
const PAD_X = 6;
/** Vertical padding inside a caption chip. */
const PAD_Y = 3;
/** Gap between the anchor point and the near edge of the chip. */
const GAP = 11;
/** Keep chips this far from the image edge. */
const MARGIN = 3;
/** Chips closer than this on both axes count as overlapping. */
const CLEARANCE = 3;
/** How many offsets to try before giving up and accepting an overlap. */
const MAX_STEPS = 7;

export interface LabelRequest {
  /** Identifies the caption; carried through to the placement. */
  key: number;
  text: string;
  /** Point on the shape the caption belongs to, in rendered pixels. */
  anchor: Point;
  /** Preferred unit direction to push the caption away from the anchor. */
  direction: Point;
  /**
   * Captions are placed in ascending order, so the ones that matter most (the
   * selected measurement) claim their preferred spot first.
   */
  priority: number;
}

export interface PlacedLabel {
  key: number;
  text: string;
  anchor: Point;
  /** Centre of the caption chip, in rendered pixels. */
  center: Point;
  width: number;
  height: number;
  /** True when the chip was pushed far enough to need a leader line. */
  leader: boolean;
}

/**
 * Width a string will occupy at `fontSize`, in pixels.
 *
 * Hangul, CJK and their punctuation are full-width; everything else is roughly
 * half. The estimate is deliberately generous: a chip slightly wider than its
 * text still reads correctly, while one too narrow clips the text.
 */
export function estimateTextWidth(text: string, fontSize = LABEL_FONT_SIZE): number {
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK radicals .. Yi
      (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
      (code >= 0xfe30 && code <= 0xfe4f) || // CJK compatibility forms
      (code >= 0xff00 && code <= 0xff60) || // full-width forms
      (code >= 0xffe0 && code <= 0xffe6);
    units += wide ? 1 : 0.56;
  }
  return units * fontSize;
}

/** Shorten a caption that is too long to sit on the image without hiding it. */
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function overlaps(a: PlacedLabel, b: PlacedLabel): boolean {
  return (
    Math.abs(a.center.x - b.center.x) * 2 < a.width + b.width + CLEARANCE * 2 &&
    Math.abs(a.center.y - b.center.y) * 2 < a.height + b.height + CLEARANCE * 2
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Place every caption so that none overlaps another and all stay on the image.
 *
 * Requests are honoured in `priority` order; a caption that cannot reach a free
 * spot within `MAX_STEPS` keeps its last candidate rather than disappearing —
 * a slightly crowded caption is still better than a missing measurement.
 */
export function layoutLabels(
  requests: LabelRequest[],
  bounds: { width: number; height: number },
): PlacedLabel[] {
  const ordered = [...requests].sort((a, b) => a.priority - b.priority || a.key - b.key);
  const height = LABEL_FONT_SIZE + PAD_Y * 2;
  const placed: PlacedLabel[] = [];

  for (const request of ordered) {
    const width = estimateTextWidth(request.text) + PAD_X * 2;
    const length = Math.hypot(request.direction.x, request.direction.y);
    // A degenerate direction (a zero-length shape) still gets a sane default:
    // straight up, where captions normally sit.
    const unit =
      length > 0
        ? { x: request.direction.x / length, y: request.direction.y / length }
        : { x: 0, y: -1 };
    // Half the chip's extent along `unit`, so `GAP` is measured from its edge
    // rather than its centre and the chip never covers its own anchor.
    const reach = (Math.abs(unit.x) * width + Math.abs(unit.y) * height) / 2;

    let chosen: PlacedLabel | null = null;
    for (let step = 0; step <= MAX_STEPS && !chosen; step += 1) {
      // Alternate sides from the second step on, so a crowded caption can fall
      // back to the far side of its shape instead of drifting ever further.
      const signs = step === 0 ? [1] : [1, -1];
      for (const sign of signs) {
        const distance = reach + GAP + step * (height + CLEARANCE * 2);
        const candidate: PlacedLabel = {
          key: request.key,
          text: request.text,
          anchor: request.anchor,
          center: {
            x: clamp(
              request.anchor.x + unit.x * distance * sign,
              width / 2 + MARGIN,
              Math.max(width / 2 + MARGIN, bounds.width - width / 2 - MARGIN),
            ),
            y: clamp(
              request.anchor.y + unit.y * distance * sign,
              height / 2 + MARGIN,
              Math.max(height / 2 + MARGIN, bounds.height - height / 2 - MARGIN),
            ),
          },
          width,
          height,
          leader: false,
        };
        candidate.leader =
          Math.hypot(
            candidate.center.x - request.anchor.x,
            candidate.center.y - request.anchor.y,
          ) >
          reach + GAP + height * 0.75;
        if (!placed.some((other) => overlaps(other, candidate))) {
          chosen = candidate;
          break;
        }
        chosen = chosen ?? null;
        if (step === MAX_STEPS && sign === signs[signs.length - 1]) chosen = candidate;
      }
    }
    if (chosen) placed.push(chosen);
  }
  return placed;
}
