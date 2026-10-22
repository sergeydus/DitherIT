# DitherIT — Image Dithering Studio

Explore dithering styles, compare results, and export reduced-color images directly in your browser.

🚀 **Live Demo**: [DitherIT on GitHub Pages](https://sergeydus.github.io/DitherIT/)

## Modernization specifications

The [specifications and requirements matrix](docs/modernization/04-delivery-and-acceptance.md) link M0–M5 implementation and test evidence. See the [release notes](docs/modernization/09-release-notes.md) for behavior changes and limitations, and [M5 validation](docs/modernization/10-m5-validation.md) for local checks and outstanding follow-up studies.

## Features

- Original, Floyd–Steinberg, Atkinson, Ordered/Bayer, Random and Threshold methods; 1–8 bits per RGB channel and post-dither Gaussian softening.
- Balanced, Classic texture, Ordered texture and Soft grain presets. Random uses a stable seed; New variation explicitly changes it.
- Original / Result / Split comparison, Fit and 25–400% zoom, keyboard pan controls and a 160 × 160 px 1:1 detail pane.
- Responsive workspace, System/Light/Dark themes, labelled native controls, keyboard workflows and a locally bundled [CC0 sample](public/samples/README.md).
- Interruptible worker rendering with a reusable resized baseline. Cancel retains settings and the last preview; Render preview applies the current settings.
- PNG export from the committed RGBA bytes, including partial transparency and softening. An export already started finishes its snapshot even if you keep editing. Comparison overlays and zoom never enter the PNG.

## Import, output and privacy

Choose or drop **one PNG, JPEG, WebP, GIF, AVIF or BMP**. Limits are **20 MiB per file, 16 million decoded pixels and 8,192 px per side**. Actual codec support depends on the browser. Animated inputs become a single still image (first/default frame); SVG, HEIC and other formats are unsupported.

The default is **Standard — up to 2048 px on the longest edge**, preserving aspect ratio and never upscaling. A 2400 × 1600 source becomes 2048 × 1365; portrait 1600 × 2400 becomes 1365 × 2048. Choose **Original dimensions** explicitly for full resolution, or **Custom width** from 1 to the source width, with height calculated automatically. Source and output dimensions are shown separately. Comparison Original means the decoded, resized baseline at the selected output dimensions.

Bits per channel describes RGB quantization, not PNG file bit depth. Four bits gives 16 levels/channel and up to 4,096 RGB colors before softening; soften may add colors. PNG output is always 8-bit RGBA. Filenames include source name, method, depth (except Original) and output dimensions, for example `photo-floyd-steinberg-4bpc-2048x1365.png`.

Image decoding, resizing, dithering and PNG encoding run locally in browser workers. Image bytes are not uploaded; there is no image service or analytics. Only the theme preference is persisted, with safe fallback if storage is blocked. The app, fonts and optional sample are static assets fetched from the host; this is not an offline-installable app.

A browser supporting module workers, `createImageBitmap`, worker `OffscreenCanvas` and `CompressionStream('deflate')` is required. Missing APIs and unsupported decoders produce recoverable errors. Full-resolution processing can use substantial memory; no mobile latency or memory guarantee is claimed. Output uses browser-normalized 8-bit sRGB; source metadata, color profiles, HDR and animation are not preserved. Browser preview canvases can round semi-transparent colors for display; the downloaded PNG preserves the committed bytes exactly.

## Run locally

Use npm and Node 22.12 or newer. Both CI workflows and `.nvmrc` select Node 22; `package.json` declares the supported minimum.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). For the production static build:

```sh
npm run build
node scripts/serve-static.mjs
```

Open [localhost:4173/DitherIT/](http://127.0.0.1:4173/DitherIT/). The helper serves `out` at the production base path. `npm start` invokes Next's server and is not the serving path for this static export.

## Checks and benchmarks

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run bench
```

Browser tests launch their own static server and exercise the built `out` under `/DitherIT/`, including keyboard operation, exact PNG pixels, axe, responsive screenshots, themes and worker lifecycle. On Linux, `npx playwright install --with-deps chromium` also installs browser system dependencies. Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium-based browser such as Edge. To reuse a separately started helper server, set `PLAYWRIGHT_REUSE_STATIC_SERVER=1`.

Screenshots and failure traces go to `test-results/`. CI also creates an HTML report in `playwright-report/` and uploads both directories on failure. The screenshot gallery is `test-results/m3-screenshots/index.html`; M4 exploration captures are in `test-results/m4-screenshots/`. These generated files are ignored by Git.

`npm run bench` is manual only: each method at 1 megapixel with soften off/on, median of five Node runs. It is not a CI gate or a browser/device p95 study. Real-device profiling, NVDA/VoiceOver and formative usability studies have not been performed; automated checks do not establish WCAG conformance.

## Deployment

GitHub Pages serves the exported `out` directory at `/DitherIT/`. In repository Settings → Pages, select GitHub Actions as the build source. The [deployment workflow](.github/workflows/deploy.yml) runs on pushes to `master` or manual dispatch. It installs from the lockfile, then gates Pages artifact upload on lint, explicit typechecking, Node tests, production build and Playwright Chromium tests. Deployment needs the successful build job. The [pull-request workflow](.github/workflows/pull-request.yml) runs the same checks without deploying or requesting Pages write permissions.

A push to `master` or manual deployment dispatch can publish all included commits. The [first push-triggered release run](https://github.com/sergeydus/DitherIT/actions/runs/39826785673) passed the required Ubuntu checks and Pages action; the live sample/render/export smoke passed. [Validation notes](docs/modernization/10-m5-validation.md) record timings, evidence and a GitHub job/environment metadata inconsistency.
