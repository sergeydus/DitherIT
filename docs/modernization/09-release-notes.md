# DitherIT modernization release notes

## User-visible changes

- Preview-first desktop workspace and a single-column mobile flow; light, dark and system themes, Geist typography and DitherIT product metadata.
- Labelled native settings, validated number fields, method descriptions, honest RGB color counts, keyboard workflows, one polite status region and recoverable errors.
- Standard output defaults to a 2048 px longest-edge cap without upscaling. Original dimensions and Custom width are explicit options; output dimensions and filenames are disclosed before export.
- A local CC0 study image, four atomic presets, explicit seeded Random variations, Original/Result/Split comparison, 25–400% zoom, keyboard panning and a 1:1 detail pane.
- Pixel work and PNG encoding run in workers. Effect changes reuse the resized baseline; superseded active jobs are terminated. Cancel keeps settings and labels the retained preview out of date. The first frame shows an explicit empty-preview message without a misleading zero-percent zoom readout.
- Export saves the committed result, independent of comparison/zoom. A started export finishes its snapshot across edits; downloads preserve alpha and exact committed RGBA bytes.

## Algorithm corrections

The pure rendering contract is versioned as `ALGORITHM_VERSION = 1`. Corrected output intentionally differs from the older renderer; fixed [golden fixtures](../../src/utils/fixtures/gradient-8x8.v1.json) and [algorithm tests](../../src/utils/dithering.test.ts) protect the new contract.

| Behavior | Before | Now |
| --- | --- | --- |
| Original method | Followed the threshold path, so it could alter pixels | Copies the decoded baseline unchanged; retained depth and soften are bypassed. Output sizing still applies |
| Ordered at 8 bits/channel | A fixed Bayer offset of −127.5 to +111.56 added heavy noise even at full depth | Noise scales with quantization step; at 8 bits all methods bypass quantization/noise before optional soften |
| Error diffusion | Intermediate byte writes lost fractional error and clamped accumulation; fractional palette levels could disagree with emitted bytes | Accumulates error in floats and compares against the actual rounded output byte. At 3 bits, input 50 emits 36 and diffuses error 14. Fully transparent pixels neither receive nor emit error |
| Soften | A CSS blur softened the visible pattern but was missing from the downloaded PNG | Gaussian blur (sigma 1, radius 3) runs **after** dithering, in premultiplied alpha, and is encoded into the PNG. It can add colors beyond the quantized palette |
| Random | New renders could change the noise implicitly | Quantization-aware offsets use Mulberry32 with a retained uint32 seed; only New variation advances the selected seed |

## Format change

The old picker accepted `image/*`. Import is deliberately narrowed to **PNG, JPEG, WebP, GIF, AVIF and BMP**, validated by headers and supported browser decoding. GIF/AVIF animation becomes a still first/default frame. SVG, HEIC and other formerly selectable formats are unsupported; no animation-detection parser is added. Limits are 20 MiB, 16 million decoded pixels and 8,192 px per side.

## Known limitations and validation

- Codec availability varies by browser. Module workers, `createImageBitmap`, worker `OffscreenCanvas` and `CompressionStream` are required. Unsupported capabilities report recoverable errors; there is no synchronous fallback.
- Full-resolution images can consume substantial memory. Bounded header checks cannot prevent every allocation inside a browser decoder. Standard sizing reduces subsequent work, not the source decoder's memory requirement.
- Browser decoding normalizes orientation/color to an 8-bit sRGB working image. Animation, metadata, original color profiles and HDR are not retained. Canvas display may round semi-transparent colors; direct PNG encoding preserves the authoritative committed bytes.
- Static assets need an initial network load. There is no service worker, offline installation, batch export, indexed PNG or additional palette mode.
- Chromium automation covers pixel parity, keyboard workflows, axe, simulated themes/preferences and responsive layouts. NVDA/VoiceOver, a full browser/touch matrix, usability studies, a reviewed photo/art before/after gallery and multi-device p95/heap profiling remain **not performed**. No WCAG conformance or device performance claim is made.
- [M5 validation](10-m5-validation.md) records local checks and the open first hosted CI/deployment verification. Pages publishing is a separate operational step.
