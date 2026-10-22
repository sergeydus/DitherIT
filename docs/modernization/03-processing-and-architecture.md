# 03 — Processing and technical architecture

## Constraints and component responsibilities — ARCH-01 (P0)

Keep the existing Next.js App Router, React, TypeScript, and Tailwind setup. Preserve `output: 'export'` and production `/DitherIT` base path. No server action, image upload endpoint, or runtime server is required. Next.js documents [static export and its unsupported server features](https://nextjs.org/docs/app/guides/static-exports); verify implementation against the project's pinned version, since online documentation can describe a newer release.

Proposed boundaries, not files created by this documentation pass:

| Boundary | Responsibility |
| --- | --- |
| `ImageDithering` / editor controller | Own source, settings, job lifecycle, status, and committed render |
| `ImageImport` | File picker/drop handling, validation, replacement, cancel |
| `PreviewWorkspace` | Canvas display, fit/zoom/pan, comparison; never define export resolution |
| `SettingsPanel` | Method/depth/soften/presets/reset as controlled inputs |
| `ExportPanel` | Dimensions, render readiness, PNG creation/download feedback |
| `useImageProcessor` | Worker creation, job queue, transfer, cancellation, error recovery |
| `baseline.worker.ts` | Decode/orient and OffscreenCanvas resize only when source/output dimensions change; return an immutable resized baseline for controller caching |
| `processing.worker.ts` | Read back a copy of the cached baseline, transform pixels, return result bitmap/buffer; no source decode, resize, DOM or UI state |
| `export.worker.ts` | Encode an immutable clicked render snapshot independently of cancelable rendering |
| `utils/dithering.ts` | Pure algorithms with validated inputs and deterministic outputs |
| `lib/image-import.ts` / `lib/render-contract.ts` | Decode/validation and shared types/settings identity |

Keep orchestration explicit with a reducer or equivalent typed state machine; an external state library is not required. Extract components around responsibilities rather than every small visual fragment. Browser globals, workers, and object URLs must be created in client-only lifecycle paths, not during static generation.

## Input contract — IN-01 (P0)

Accept one PNG, JPEG, WebP, GIF, AVIF, or BMP file where the browser decoder supports it. Preserve GIF/AVIF/BMP compatibility from the current permissive `image/*` picker. Do not treat picker filters, MIME strings, or extensions as proof of decodability: check byte size and recognizable format signatures, allow empty browser MIME values for valid content, and surface decoder failures. SVG/HEIC and unlisted types are deliberately unsupported in the new validated contract; document this narrowing from the old picker rather than implying identical format coverage.

For animated inputs, take the decoder's first/default still image and explain that only that image is edited/exported. Use a stable File/Blob → ImageBitmap path, not a running animated HTMLImageElement whose current frame depends on timing. The [HTML ImageBitmap rules](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#imagebitmapfactories) define default-image/first-frame handling. Test animated GIF, WebP, PNG, and AVIF fixtures on the supported browser; report unsupported decoding gracefully. Do not write animation-detection parsers solely to reject animation or promise a frame selector.

Provisional limits: 20 MiB compressed bytes (20 × 1024 × 1024), 16,000,000 decoded pixels, maximum 8,192 px on either oriented source dimension. Reject byte oversize before decoding. Where a small bounded signature/dimension reader or maintained library can provide dimensions, preflight before full decode; malformed metadata fails safely. AVIF/container parsing must not grow into an animation parser requirement. Recheck decoded bitmap dimensions before canvas/readback allocations; when no reliable preflight is available, decoding itself may allocate before that check. Record this limitation rather than claiming all oversized allocations are prevented. No repeated decode retry loop or silent shrink to bypass an input limit. These defaults are not universal browser canvas limits; basic boundary/recovery tests are required and wider memory/device profiling is recommended.

Use `createImageBitmap(file, { imageOrientation: 'from-image' })` with browser color conversion, and verify rotated JPEG fixtures to avoid double orientation. Target an sRGB OffscreenCanvas working surface and 8-bit RGBA PNG output; do not promise ICC-profile preservation, HDR, animation, or metadata retention. Source orientation metadata should not survive in a form that rotates the exported PNG again.

Each import gets a monotonically increasing identity. A canceled or superseded decode cannot replace the current source. Release the previous source only after successful replacement; release failed/canceled candidates promptly. Clear the file input value after handling a selection so the same file can be selected again. Revoke object URLs after their consumers finish, close ImageBitmaps, and clean up on unmount.

No image bytes, filenames, or EXIF data may be transmitted or stored persistently. Settings and images are session-only; theme is the sole persisted preference in this scope. Static asset requests for the sample are allowed. “Processed in your browser” does not imply the site works offline.

## Canonical render contract — IMG-01 through IMG-04 (P0)

One committed render is the authoritative result for both screen display and PNG export. Processing inputs are source identity, output dimensions, method, bits per channel, soften flag, random seed, and algorithm version. Changing view mode, zoom, split position, or theme never changes pixels or reruns processing.

Pipeline:

1. Retain the immutable source File/Blob. On source or effective output-dimension changes, prepare an oriented ImageBitmap and resize it with high-quality smoothing in a baseline-preparation worker using OffscreenCanvas. Return the resized baseline to the controller, which owns and caches it by source identity, width and height. Decode/resize are not repeated for method/depth/soften/seed changes. A baseline change may decode again; an effect-only change must not.
2. Post the cached baseline ImageBitmap to each render worker **without putting that bitmap in the transfer list**. Structured cloning gives that worker its own copy while the controller keeps a valid original. Draw the copy at its existing dimensions into a worker OffscreenCanvas and call `getImageData` there; no resizing is needed. The Original comparison view uses the cached baseline and updates only when source/output dimensions change. Cross-browser resampling can differ; require within-browser parity rather than universal byte-identical exports.
3. For Original, bypass soften and quantization. At source size, preserve the decoded RGBA pixels, subject to the browser's color conversion and transparent-pixel representation.
4. For other methods, dither RGB first, then optionally soften the resulting pattern using the Gaussian transform below.
5. Write result pixels to an OffscreenCanvas in the render worker. Return a result ImageBitmap and the authoritative RGBA buffer for export snapshots; do not regenerate the Original comparison bitmap on each effect render. Commit only if the complete job identity still matches selected state and baseline key.
6. Present the bitmaps without UI-thread full-image readback/pixel writes. Encode exports off-thread from the clicked committed buffer at its exact dimensions, regardless of later edits.

**Product decision: preserve post-dither blur.** The existing CSS filter blurs the finished pattern. A pre-dither blur would change the artistic effect, so it is not introduced here. Move the effect into the pixels and label it “Soften dither pattern.” Its radius is defined in output pixels, so it is stable under zoom; this deliberately replaces the current display-dependent CSS radius. Exact historical CSS-rendered pixels are not a compatibility guarantee.

Soften is a separable Gaussian blur after dithering with sigma 1 output pixel, radius 3, normalized weights `w(i) = exp(-i² / 2)` for integer offsets -3 through 3, and clamp-to-edge sampling. Blur premultiplied dithered RGB and alpha together, then unpremultiply and set RGB to zero where alpha is zero. This can introduce colors outside the quantized palette and modify transparent edges; disclose both. The softened RGBA becomes the committed result; never apply a second CSS blur for preview.

For methods without soften, retain the source alpha values after resizing. Do not diffuse errors into or from fully transparent pixels. Preserve partially transparent alpha and process its straight RGB values. Tests must cover colored transparent edges so hidden RGB does not create visible halos.

Quantization uses `L = 2^bits`, `q = 255 / (L - 1)`, `level = round(clamp(v, 0, 255) / q)`, and **`outputByte = round(level * q)`**. Validate integer bits 1–8 at the processing boundary; reject invalid settings. In diffusion, write `outputByte` and compute `error = oldWorkingValue - outputByte`, using the actual emitted byte, not the unrounded `level * q`. Accumulate that error in floating-point neighbor buffers. Keep intermediate values unclamped until quantizing; final byte rounding is explicit rather than relying on typed-array conversion.

| Method | Contract |
| --- | --- |
| Original (`none`) | Return a copy of the resized decoded source; never dispatch to threshold. Ignore retained depth/soften settings in the effective render identity. |
| Threshold | Quantize each RGB channel; no added noise or error diffusion. |
| Floyd–Steinberg | Preserve existing traversal and 7/16, 3/16, 5/16, 1/16 neighbor weights. Diffuse error against `outputByte` using float working data; do not wrap rows or repeatedly clamp diffusion buffers to bytes. |
| Atkinson | Preserve six 1/8 neighbor weights and intentional undistributed error; diffuse error against `outputByte` in float working data with correct boundaries. |
| Ordered | Use the existing 4 × 4 Bayer rank matrix. Add `(((rank + 0.5) / 16) - 0.5) * q` per channel before quantization; anchor rank coordinates at the output's top-left. |
| Random | Seeded PRNG, uniform channel noise in `[-q/2, q/2)`, row-major RGBA traversal with a documented stable PRNG algorithm. Same source/settings/seed must produce identical pixels within the supported rendering environment. |

At 8 bits per channel, all processed methods bypass quantization/noise/error diffusion, then optionally apply post-dither soften to the resized baseline. Without soften, they return that baseline unchanged. This explicitly fixes the current heavily noisy 8-bit Ordered behavior. Reject unknown method IDs instead of silently substituting a different algorithm. Increment algorithm version when output math changes; do not silently change golden fixtures.

Implementation note: the formulas and floating-point accumulation deliberately change existing output. This is a proposed algorithm correction, not a pixel-compatible refactor. Document the visual change in release notes; a photo/gradient/pixel-art gallery review is recommended alongside the required synthetic regression fixtures.

## Worker scheduling and state — PERF-01 and PERF-02 (P0)

The current `setTimeout` defers work but still runs it on the UI thread. Source/size preparation path: `createImageBitmap` → worker OffscreenCanvas resize → controller-owned cached baseline. Effect render path: structured-cloned baseline → worker `getImageData` → transform → worker `putImageData` → result ImageBitmap. Use a separate export worker and OffscreenCanvas `convertToBlob` for clicked snapshots. [MDN documents OffscreenCanvas worker rendering](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas); [createImageBitmap options](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) cover orientation and decoding. The [HTML standard defines ImageBitmap serialization as a bitmap copy](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#the-imagebitmap-interface), distinct from transferring and detaching its owner. No UI-thread resize/readback/putImageData fallback is assumed.

Proposed shared contracts (illustrative types, not implementation):

```ts
type RenderRequest = {
  kind: 'render';
  jobId: number;
  sourceId: number;
  baselineKey: string; // source identity + effective output width/height
  settingsKey: string;
  width: number;
  height: number;
  baselineBitmap: ImageBitmap; // structured-cloned; cached owner is NOT transferred
  method: DitheringMethod;
  bitsPerChannel: number;
  soften: boolean;
  seed: number;
  algorithmVersion: number;
};

type RenderReply =
  | { kind: 'complete'; jobId: number; sourceId: number;
      baselineKey: string; settingsKey: string; width: number; height: number;
      pixels: ArrayBuffer; resultView: ImageBitmap }
  | { kind: 'failed'; jobId: number; code: 'invalid-input' | 'processing-failed' };
```

Set pending/busy state as soon as a valid effective setting changes, before scheduling/dispatch, closing the existing 10 ms export gap. Immediately invalidate the old job and terminate its render worker rather than waiting for an obsolete render to finish. Coalesce range input with a trailing 100 ms debounce before recreating the worker; apply select, checkbox, preset, reset, numeric commit, and Render preview actions immediately. Keep at most one latest pending request and one active render; skip intermediate slider values. While debouncing, label the last result updating and disable new exports.

Check `jobId`, `sourceId`, `baselineKey`, and `settingsKey` before committing a reply or clearing busy state; close stale reply bitmaps and discard their buffers. Terminate the effect-render worker on a superseding render request, user Cancel, successful source replacement, or unmount. Sending a cancel message alone cannot interrupt a synchronous worker loop. Cancel retains selected settings and marks the preview out of date; Render preview starts those settings explicitly. Do not roll controls back to the last render.

Terminating an effect-render worker destroys only its cloned baseline and working buffers. The controller's cached bitmap remains valid and is cloned to the next worker; do not re-read or decode the source on every slider pause. Baseline preparation has a separate source/dimension identity and lifecycle: effect changes can replace the pending render settings but do not restart an in-flight preparation for the same key. New source/output dimensions invalidate preparation; close late preparation replies. User Cancel can stop pending preparation, but must retain any completed reusable baseline. An already encoding export snapshot is independent and survives render-worker termination or source replacement.

Keep the Original comparison bitmap keyed to the baseline, independent of effect settings. While a new source/size is preparing, retain the old committed Original/Result pair together with an updating/out-of-date label; switch the displayed pair only when a matching result commits. Do not align an old result against a newly resized original.

On failure, clear the appropriate pending state, retain the last committed result labeled out of date, and offer Retry. A worker crash must not create an infinite restart loop. If worker creation is unsupported or repeatedly fails, show the defined recoverable error; do not silently fall back to unrestricted main-thread processing. Worker startup/static export must pass the required smoke test on one supported desktop engine; the broader compatibility matrix is recommended follow-up evidence.

Use transfers for worker-produced result buffers/bitmaps where appropriate; never transfer away the controller's cached baseline. Present it without consuming ownership (e.g. `drawImage`, not `transferFromImageBitmap` on that cached object). For export, send an independent snapshot copy so render replacement cannot detach its data. Bound storage to one desired baseline, the last committed Original/Result pair (sharing the baseline when keys match), active working copies, latest pending descriptor, and at most one export snapshot. Close obsolete baseline bitmaps when neither the cache nor displayed pair needs them, and close all on teardown. A 16-megapixel RGBA buffer alone is approximately 64 MB, and decode/canvases/snapshots add memory. Prefer bounded scanline working buffers; do not claim a precise memory ceiling before profiling.

## Output consistency and resource lifecycle — EXP-01 and EXP-02 (P0)

Render at selected output dimensions, then fit display bitmaps in CSS. Default Standard size caps the longest edge at 2048 px with no upscaling, bounding default output to roughly 4.2 MP even for square images; Original dimensions and Custom width are explicit options. This is a disclosed output-size choice, not a draft. Keep one authoritative render; do not secretly export higher resolution. Provide 100% zoom and the 1:1 detail pane to inspect patterns hidden/aliased at Fit.

On Export PNG, atomically snapshot the committed pixels, identity, dimensions, settings, and filename. Send that immutable snapshot to the export worker; encode it with OffscreenCanvas, never a display-only split view. Finish this requested download even if the user changes settings, cancels rendering, or replaces the source while it encodes. Status says “Preparing PNG for <snapshot filename>…” and completion identifies the same file. Disable duplicate exports while one is active, without blocking editing. Component/page teardown may end in-flight work; cross-navigation persistence is outside scope.

Handle encoder rejection, null Blob in any compatibility encoder, and download handoff failure. Create the Blob URL after encoding and revoke it on a deferred cleanup (proposed 60 seconds after initiating download, also cleaned on teardown), not immediately after `click()`. Verify the grace period on the supported browser; it is a lifetime policy, not evidence that a browser finished saving.

PNG retains alpha. Blur can alter alpha as specified above. Original output means unchanged decoded content at source size, not the original compressed file bytes or metadata. Do not estimate output file size as an exact value before encoding.

## Provisional performance targets

These are recommended performance investigation targets, not hard release gates or measurements of the existing app. Required functional checks still verify responsive control/cancel feedback and supersession without waiting for obsolete jobs:

| Operation | Desktop target | Mobile target |
| --- | --- | --- |
| Visible pending feedback after a setting change | Within 100 ms | Within 100 ms |
| 1-megapixel render, excluding decode/PNG encode | p95 ≤ 500 ms | p95 ≤ 1,500 ms |
| Cancel feedback and invalidation | Within 100 ms | Within 100 ms |
| UI-thread scheduling/snapshot/presentation tasks | Investigate tasks over 50 ms | Investigate tasks over 50 ms |

For the recommended benchmark study, measure all methods with soften on/off across 20 runs after one warm-up per scenario. Record device model, OS, browser version, input/output size, and median/p95; separate source/size decode-resize preparation, baseline cache hits, bitmap cloning, render-worker startup/readback, transform, result transfer/presentation, snapshot copy, and PNG encode. Verify interrupted effect jobs reuse preparation; source/size changes legitimately prepare again. Cover Standard output plus opt-in 1-, 4-, and 16-megapixel renders. A 1 MP timing must not be presented as a measured 16 MP runtime. Bitmap cloning/presentation, allocation/GC, or snapshot copying can still stall the UI; investigate tasks over 50 ms rather than claiming their absence by architecture alone.

Initial compatibility target: current and previous stable desktop Chrome, Edge, Firefox, Safari, plus current stable iOS Safari and Android Chrome at release time. Feature-detect ImageBitmap cloning/transfer, worker OffscreenCanvas 2D, and worker PNG encoding; show an actionable unsupported-browser error if unavailable. Required static-path workflow verification runs on one supported desktop engine plus a narrow viewport; the full real-device/browser p95 matrix is recommended. Any known crash, failed core workflow, or unsupported format must be disclosed or fixed before release, even if discovered by a recommended study.

## Project maintenance — ARCH-02 (P1), QA-01 (P0)

- Introduce semantic CSS tokens and component classes without a required component-library dependency. Use native form elements and a consistent local icon style.
- Add useful document metadata and ensure font/fallback styles match the visual spec. Keep font assets self-hosted in the generated output and document build-time font-fetch requirements if retained.
- Audit dependencies during implementation against official release/security notes, retain the lockfile, and upgrade only with a demonstrated compatibility/security reason. No speculative “latest” version is prescribed here.
- Add CI lint, explicit type checking, algorithm tests, workflow tests, accessibility checks, and build before the existing artifact upload/deploy stages. Keep preview verification independent from publishing.
- QA-01 includes the independent one-line push-filter correction from `main` to `master`, preserving `workflow_dispatch`. It is applied locally now and can ship at any time without waiting for M5. Validate the branch filter separately from later CI improvements; record a later authorized push-triggered deployment without claiming this local change has deployed.
- Verify worker chunks, sample assets, fonts, favicon, and navigation under `/DitherIT/` using the static production output. Avoid hardcoded root asset paths. Do not depend on `next start` to serve an exported application.
- Update README usage, supported formats/limits, local processing statement, output behavior, and deployment instructions when implementation lands; remove misleading starter deployment guidance then.

No account, analytics, service worker, persistence database, or network image fetch is introduced by this plan. Consider a CSP compatible with the generated static assets and workers as a separately verified hardening task; do not deploy an untested restrictive policy that breaks processing.
