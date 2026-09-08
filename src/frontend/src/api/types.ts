/** image_type is now free text managed via the catalog, not a fixed union. */
export type ImageType = string;

export type CatalogCategory =
  | "image_type"
  | "product_id"
  | "lot_id"
  | "wafer_id"
  | "process_step";

export interface CatalogOption {
  id: number;
  category: CatalogCategory;
  value: string;
  is_predefined: boolean;
}

export interface CatalogCreateInput {
  category: CatalogCategory;
  value: string;
}

export interface CatalogUpdateInput {
  value: string;
}

export interface MeasurementTypeSummary {
  measurement_type: MeasurementType;
  unit: string;
  count: number;
  mean: number;
  min: number;
  max: number;
}

export interface SummaryView {
  image_count: number;
  measurement_count: number;
  calculated_at: string;
  types: MeasurementTypeSummary[];
}

export interface ImageListView {
  id: number;
  original_filename: string;
  image_type: ImageType;
  product_id: string;
  lot_id: string;
  wafer_id: string;
  process_step: string | null;
  calibration_nm_per_pixel: number;
  pixel_width: number;
  pixel_height: number;
  created_at: string;
  file_url: string;
  measurement_count: number;
}

export type ImageView = Omit<ImageListView, "measurement_count">;

/**
 * How a measurement is drawn and what its value means:
 * - length: a line segment between 2 points; value in nm.
 * - angle: 3 points (vertex first, then the two arm ends); value in degrees.
 * - curvature: 3 points on an arc; value is the fitted circle radius in nm.
 */
export type MeasurementType = "length" | "angle" | "curvature";

export interface Point {
  x: number;
  y: number;
}

export interface MeasurementView {
  id: number;
  image_id: number;
  /** The per-product item this realises, or null for an ad-hoc measurement. */
  item_id: number | null;
  measurement_type: MeasurementType;
  /** Original-pixel points as placed: 2 for length, 3 for angle/curvature. */
  points: Point[];
  /** Computed result, expressed in `unit` (nm or deg). */
  value: number;
  unit: string;
  calibration_nm_per_pixel: number;
  /** What this measurement is, e.g. "Gate CD". Drawn beside the shape. */
  label: string | null;
  /** Free observation memo about the same measurement. */
  note: string | null;
  measurement_method: "manual";
  reference_status: "unreviewed";
  created_at: string;
}

export interface ImageDetailView extends ImageView {
  measurements: MeasurementView[];
}

export interface MeasurementCreateInput {
  measurement_type: MeasurementType;
  points: Point[];
  item_id: number | null;
  label: string | null;
  note: string | null;
}

export interface MeasurementItemView {
  id: number;
  product_id: string;
  name: string;
  measurement_type: MeasurementType;
  created_at: string;
}

export interface MeasurementItemCreateInput {
  product_id: string;
  name: string;
  measurement_type: MeasurementType;
}

export interface MeasurementItemUpdateInput {
  name: string;
  measurement_type: MeasurementType;
}

/** Both fields are replaced together, so a request states the whole annotation. */
export interface MeasurementAnnotationInput {
  label: string | null;
  note: string | null;
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  detail?: { field?: string } | null;
}
