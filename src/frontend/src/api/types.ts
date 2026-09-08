export type ImageType = "SEM" | "TEM";

export interface ParameterSummary {
  parameter_type: ParameterType;
  count: number;
  mean_nm: number;
  min_nm: number;
  max_nm: number;
}

export interface SummaryView {
  image_count: number;
  measurement_count: number;
  calculated_at: string;
  parameters: ParameterSummary[];
}

export interface ImageListView {
  id: number;
  original_filename: string;
  image_type: ImageType;
  product_id: string;
  lot_id: string;
  wafer_id: string;
  calibration_nm_per_pixel: number;
  pixel_width: number;
  pixel_height: number;
  created_at: string;
  file_url: string;
  measurement_count: number;
}

export type ImageView = Omit<ImageListView, "measurement_count">;

export type ParameterType = "CD" | "Depth" | "Thickness";

export interface MeasurementView {
  id: number;
  image_id: number;
  parameter_type: ParameterType;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  distance_px: number;
  calibration_nm_per_pixel: number;
  value_nm: number;
  note: string | null;
  measurement_method: "manual_two_point";
  reference_status: "unreviewed";
  created_at: string;
}

export interface ImageDetailView extends ImageView {
  measurements: MeasurementView[];
  annotations: AnnotationView[];
}

export interface MeasurementCreateInput {
  parameter_type: ParameterType;
  start: { x: number; y: number };
  end: { x: number; y: number };
  note: string | null;
}

export type ShapeKind = "arrow" | "circle";

export type ProductType = "DRAM" | "Flash" | "Logic" | "Sensor";

export interface AnnotationView {
  id: number;
  image_id: number;
  kind: ShapeKind;
  start_x: number;
  start_y: number;
  end_x: number;
  end_y: number;
  product: ProductType | null;
  step: string;
  measurement_name: string;
  created_at: string;
}

export interface AnnotationCreateInput {
  kind: ShapeKind;
  start: { x: number; y: number };
  end: { x: number; y: number };
  product: ProductType | null;
  step: string;
  measurement_name: string;
}

export interface AnnotationUpdateInput {
  product: ProductType | null;
  step: string;
  measurement_name: string;
}

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  detail?: { field?: string } | null;
}
