# NANoDB Measurement Context

This export contains one selected image record and all of its saved measurements.
Coordinates use the original image pixels: origin at top-left, X to the right, Y down.
Valid points satisfy 0 <= x < pixel_width and 0 <= y < pixel_height.
Distance is sqrt((end_x-start_x)^2 + (end_y-start_y)^2).
value_nm is distance_px multiplied by the measurement calibration_nm_per_pixel.
Stored precision is used for calculations.
Display values use decimal half-up to 2 places.
parameter_type is a user choice among CD, Depth and Thickness.
measurement_method is manual_two_point and reference_status is unreviewed.
Measurements are references, not certified ground truth or automatic boundary detection.

annotations are shapes a user drew to mark where they looked, in the same original
pixel coordinates. kind is arrow or circle. For an arrow, start is the tail and end
is the head. For a circle, start is the centre and end is a point on the circumference,
so the radius is the distance between them. product, step and measurement_name are
free user labels and may be empty.
annotations carry no calculated value: they are not measurements, they have no nm
value, and they must not be counted in any measurement summary.

The image binary is not included; inspect it in NANoDB when visual context is required.
