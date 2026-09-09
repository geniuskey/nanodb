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
  note: string | null;
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
  measurement_method: MeasurementSource;
  /** Who produced it: a human ("manual") or the feature extractor ("auto"). */
  source: MeasurementSource;
  /** 0..1 self-estimate for auto measurements; null for manual. */
  confidence: number | null;
  reference_status: "unreviewed";
  /**
   * Correction trail. `points` and `value` always read as the measurement
   * stands now; once `adjusted_at` is set a person has moved the points and
   * these hold what it read when first produced, so the machine's answer stays
   * comparable. All three are null while the measurement is uncorrected.
   */
  original_points: Point[] | null;
  original_value: number | null;
  adjusted_at: string | null;
  created_at: string;
}

/** New positions for a saved measurement's points; the server revalues them. */
export interface MeasurementGeometryInput {
  points: Point[];
}

/** Auto values are never presented as verified: the two are kept distinct. */
export type MeasurementSource = "manual" | "auto";

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

export interface SegmentationClassStat {
  class_index: number;
  intensity_range: number[];
  pixels: number;
  area_fraction: number;
  mean_intensity: number | null;
  area_nm2: number | null;
}

export interface SegmentationResultView {
  image_id: number;
  method: string;
  classes: number;
  denoise_weight: number;
  min_size: number;
  thresholds: number[];
  class_stats: SegmentationClassStat[];
  duration_ms: number;
  downscaled: boolean;
  has_tagged_tiff: boolean;
  map_url: string;
  boundary_url: string;
  created_at: string;
  replaced: boolean;
}

export interface SegmentationRunInput {
  classes?: number;
  denoise_weight?: number;
  min_size?: number;
}

export interface SkippedFeature {
  key: string;
  reason: string;
}

export interface FeatureExtractionResultView {
  image_id: number;
  target_class: number;
  region_area_px: number;
  region_clipped: boolean;
  measurements: MeasurementView[];
  skipped: SkippedFeature[];
  /** Auto measurements a person had corrected, which this run left standing. */
  preserved_adjusted: number;
}

export interface FeatureExtractionInput {
  target_class?: number;
}

export interface SegmentationBatchInput {
  image_ids: number[];
  classes?: number;
  denoise_weight?: number;
  min_size?: number;
  extract_features?: boolean;
  target_class?: number;
}

export interface BatchItemResult {
  image_id: number;
  status: "ok" | "error";
  replaced: boolean;
  feature_count: number | null;
  skipped_count: number | null;
  code: string | null;
  message: string | null;
}

export interface SegmentationBatchResultView {
  requested: number;
  succeeded: number;
  failed: number;
  items: BatchItemResult[];
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  detail?: { field?: string } | null;
}
