# Manual arm prompt (no exported context)

This is the **baseline** arm of the US-07 comparison. Here a person prepares the
explanation for the external AI tool by hand, without attaching NANoDB's
exported context files. Paste the text below (edited to match the specific
image you are describing) into the external AI tool, then attach or paste the
measurement values yourself.

The purpose of this arm is to measure how much effort a hand-written
explanation takes and how well the resulting code performs, so it can be
compared against the context-export arm. Record preparation time and every
follow-up request needed to reach a usable answer.

---

You are helping analyze semiconductor measurement data.

Context you must convey manually (fill in from the NANoDB image detail page):

- The measurements come from a single microscope image (SEM or TEM).
- Coordinates are in original image pixels: origin at the top-left, X increases
  to the right, Y increases downward. Valid points satisfy
  `0 <= x < pixel_width` and `0 <= y < pixel_height`.
- A measurement is a straight two-point segment. Distance in pixels is
  `sqrt((end_x - start_x)^2 + (end_y - start_y)^2)`.
- `value_nm` is `distance_px` multiplied by the measurement's
  `calibration_nm_per_pixel`.
- Calculations use stored precision; displayed values are rounded half-up to two
  decimal places.
- `parameter_type` is one of `CD`, `Depth`, `Thickness`, chosen by the user.
- Measurements are unreviewed manual references, not certified ground truth, and
  there is no automatic boundary detection.

Paste the measurement rows here (parameter_type and value_nm for each), then ask:

> Read the measurements and write a CSV with columns `parameter_type,count,mean_nm`.
> Include only parameter types that have measurements, ordered CD, Depth,
> Thickness. Compute the means at full precision and display `mean_nm` to two
> decimal places. Do not call external services and do not infer image
> boundaries.

Do not have the tool fetch anything from the network.
