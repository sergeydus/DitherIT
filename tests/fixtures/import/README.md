# Synthetic import fixtures

All images are generated for this repository from gradients and solid colors; no third-party imagery or private metadata is included.

- `still.png`, `still.webp`, `still.bmp`: 8 × 6 RGB gradient, with transparent/partially transparent columns where the format retains alpha.
- `oriented.jpg`: encoded 8 × 6, EXIF orientation 6; decoded output must be 6 × 8.
- `animated.gif`, `animated.webp`, `animated.avif`: red default/first frame, then blue.
- `animated.png`: green default image (RGB 0,128,0), followed by red/blue animation frames; default and first animation frame deliberately differ.
- `large.png`: 2400 × 1600 row gradient for Standard-size and cancellation smoke tests.
- `limit-16mp.jpg`: 4000 × 4000 row gradient at the decoded-pixel limit, for actual baseline cache reuse checks.

These fixtures test import/decoder behavior; algorithm goldens live in `src/utils/fixtures`.
