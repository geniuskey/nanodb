export type ImageType = "SEM" | "TEM";

export interface SummaryView {
  image_count: number;
  measurement_count: number;
  calculated_at: string;
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

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  detail?: { field?: string } | null;
}
