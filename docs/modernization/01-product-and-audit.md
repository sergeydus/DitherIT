# 01 — Product direction and current-state audit

## Product intent

Help a person turn a photo, illustration, or texture into a deliberate reduced-color image without needing to understand image-processing terminology first. Make the algorithm understandable in context, show the effect clearly, and make the downloaded result predictable.

Primary audience hypotheses are designers exploring image treatments, pixel-art and retro-computing enthusiasts, and people learning about dithering. These are planning assumptions; the repository contains no user research proving their relative importance.

Core job: “When I have an image, help me try a few reduced-color looks, inspect the differences, and save the result at a known size.”

## Repository baseline

The app uses Next.js 16.1.1, React 19.2.3, TypeScript, Tailwind 4, and the Canvas API. A single client component owns import, controls, rendering, export, and explanatory content. Six method options are exposed, including Original. Deployment uses static export at `/DitherIT` on GitHub Pages. These are observations of the checked-in files, not an assessment of dependency freshness or security.

Source references below are repository-relative. Findings and line references describe the pre-modernization snapshot reviewed on 2026-10-22, rather than asserting that each issue is still present. The requirement register in specification 04 tracks implementation and remaining checks.

| Finding | Source evidence | User impact | Requirement |
| --- | --- | --- | --- |
| Original runs threshold quantization | `src/utils/dithering.ts:167` returns `thresholdDither` for `none` | “Original” can visibly change the input | IMG-01, P0 |
| Blur is a post-dither CSS canvas filter | `src/components/ImageDithering.tsx:230`; export uses `toBlob` at line 88 | Display softens the dither pattern, but download omits that effect | IMG-02, P0 |
| Image processing/export share a reduced canvas | `ImageDithering.tsx:42` caps width at 800 and height at 600; export reads that canvas | Large sources silently lose output resolution | EXP-01, P0 |
| Processing is synchronous inside a timer | `ImageDithering.tsx:75`; busy state is set and cleared within the same callback | Work still blocks interaction; busy feedback may never paint | PERF-01, P0 |
| Download is enabled during the timer gap | `ImageDithering.tsx:69–81` redraws the source before the 10 ms timer sets busy; download reads that canvas | Clicking Download in that gap can export the undithered image rather than the selected result | EXP-02, PERF-02, P0 |
| Download URL is revoked immediately | `ImageDithering.tsx:94–95` calls `click()` then `revokeObjectURL()` | Browser download handoff has no deferred URL lifetime; immediate revocation risks failed downloads | EXP-02, P0 |
| Scheduled work has no cleanup or request identity | Processing effect at `ImageDithering.tsx:61–81` | Pending work cannot be reliably invalidated on replacement or teardown | PERF-02, P0 |
| Import assumes decoding succeeds | `ImageDithering.tsx:17–31`; no reader/decode error path or resource limits | Failed or oversized inputs lack recovery guidance | IN-01, P0 |
| Color depth wording is ambiguous | `ImageDithering.tsx:149` says “bit” while deriving `2^(3 × bits)` colors | One bit can be mistaken for black and white, although RGB allows eight combinations | UX-03, P0 |
| Several visible labels lack control association | Upload/method/depth labels at `ImageDithering.tsx:106,126,148`; the “Filters” label at line 169 has no associated control (the checkbox's own line-182 label is associated) | Accessible control names are incomplete; Filters should be a section heading or fieldset legend | A11Y-01, P0 |
| Typography and identity are inconsistent | `globals.css:11,25` defines Geist tokens but sets Arial; `layout.tsx:16` has starter metadata | Product identity and shared styling are unfinished | UI-01, UI-02, P1 |
| Controls precede the preview in a full-width panel | `ImageDithering.tsx` and `src/app/page.tsx` | On narrow screens the effect is separated from adjustments | UX-01, P1 |
| No comparison, sample, preset, reset, or output-size controls | Full `ImageDithering.tsx` component | First use requires a file and experimentation is harder to evaluate | UX-02, UX-04, UX-05, P1 |
| Error diffusion accumulates in clamped bytes | `src/utils/dithering.ts:13,49` | Fractional errors are rounded and intermediate values clip | IMG-03, P0 |
| Ordered adds a large offset at every depth | `dithering.ts:98`: `(rank / 16 - 0.5) * 255` ranges from −127.5 to +111.5625, independent of depth | Even 8-bit Ordered is heavily noisy; it does not preserve an already full-depth image | IMG-04, P0 |
| Random amplitude ignores quantization step and has no seed | `dithering.ts:121` adds ±25 noise using `Math.random()` | High-depth Random still adds visible noise; repeated results vary | IMG-04, P0 |
| Validation is limited to the available lint/build scripts | `package.json`; `.github/workflows/deploy.yml` installs/builds/deploys | No checked-in behavioral regression suite or CI lint gate | QA-01, P0 |
| Push deployment watched a nonexistent branch (corrected) | Audited `.github/workflows/deploy.yml:6` watched `main`; local HEAD and GitHub branch list show only `master`; both recorded runs were `workflow_dispatch` | Pushes previously missed deployment; the trigger targets `master`, independently of the modernization packages. Verify the first push-triggered run | QA-01, P0 |

Branch/run evidence checked on 2026-10-22: [branches](https://github.com/sergeydus/DitherIT/branches), manual run [20881990774](https://github.com/sergeydus/DitherIT/actions/runs/20881990774) and [21870731950](https://github.com/sergeydus/DitherIT/actions/runs/21870731950). The push filter targets `master`; verify it on the first push-triggered run. This correction is independent of the modernization packages.

## Explicit product decisions after review

- **Keep blur after dithering.** The current CSS blur softens the generated pattern. Preserve that effect order, move it into the rendered pixels, and label it “Soften dither pattern.” Pre-dither blur would be a different feature and is outside this release. Define the kernel at output resolution so export and inspection agree, rather than retaining a CSS zoom-dependent radius. Softened output can contain intermediate colors beyond the pre-blur quantization palette; state this in the UI.
- **Cap default output work.** First import/reset uses Standard size, at most 2048 px on the longest edge, with no upscaling. Original dimensions is an explicit option. A longest-edge cap also bounds portrait images, unlike a width-only cap. Keep one authoritative render and add a 1:1 loupe alongside 100% zoom to inspect patterns hidden or aliased at Fit. The old mobile budget extrapolates to about 24 seconds at 16 MP if cost were linear; this is a warning about the proposed default, not a measured runtime or scaling guarantee.
- **Keep broader raster input.** The current `image/*` picker delegates format support to the browser, including GIF, AVIF, and BMP where decodable. Preserve these alongside PNG/JPEG/WebP. Normalize animated images to the first/default still image and disclose that animation is not exported; do not add a parser solely to reject animation. SVG/HEIC and other unlisted types are deliberately unsupported in the new validated contract, a narrowing from the permissive picker that must appear in release notes.
- **Separate settings, renders, and exports.** Cancel retains the user's settings and marks the preview out of date. New render requests terminate obsolete processing. A clicked export finishes its immutable snapshot even if later settings/source changes; filenames and status identify that snapshot.
- **Separate release checks from research.** Pixel parity, cancellation/recovery, keyboard workflow, axe, and static-path verification are required. Usability sessions, NVDA/VoiceOver studies, and multi-device p95 benchmarking are recommended and tracked, rather than release blockers. Accessibility remains a design target without a conformance claim.

## Goals and measures

| Goal | Proposed acceptance measure | How to establish it |
| --- | --- | --- |
| Make first use understandable | Recommended: at least 4 of 5 formative participants import or use a sample, change a look, and export without assistance within two minutes | Observe a small task-based session; record obstacles without uploading their images |
| Make results trustworthy | All output-contract scenarios in the acceptance plan pass | Decode exported PNGs and compare pixels/dimensions with the committed render buffer |
| Keep interaction responsive | Required: controls, cancellation, and stale-result checks pass; recommended: investigate the provisional budgets in specification 03 | Basic workflow checks are gates; multi-device p95 benchmarks are recommended evidence |
| Support keyboard and assistive technology | Required: keyboard workflow and axe; recommended: assistive-technology studies | Check semantics/status manually; NVDA/VoiceOver testing is recommended follow-up, not proof implied by axe |
| Make mobile editing practical | No page-level horizontal scroll at 320 CSS px; primary workflow works at 200% text size | Responsive and zoom testing |

No baseline timings or task-completion rates have been measured. The usability target is a formative signal, not a statistical claim. If participant testing is unavailable, document that release limitation instead of reporting the target as met.

## Release scope

P0: truthful processing/export, validated imports, clear settings language, accessible basic controls, worker lifecycle, and regression coverage.

P1: complete workspace redesign, responsive layouts, comparison, sample and presets, reset behavior, theme support, contextual guidance, product metadata, and documentation cleanup.

P2 candidates: custom palettes and a dedicated monochrome mode, batch processing, crop/resize tools, history, additional export formats, installable/offline support, and shareable settings. Each requires a separate specification. In particular, one bit per RGB channel must never be marketed as monochrome.

Exclude accounts, cloud storage, remote image URLs, AI generation, collaboration, and a backend from this release. Avoid adding services or frameworks without a demonstrated requirement.

## Product principles

1. Show the image as the main working surface.
2. Every control must explain an observable change or a clear output choice.
3. Preserve the last good image through errors and replacement attempts.
4. Show dimensions, processing state, and output effects before export.
5. Make advanced information available without requiring it for the first result.

## Validation assumptions

The proposed 20 MiB/16-megapixel input limits, 2048 px default output cap, default algorithm, sample image, theme colors, and device budgets need validation during implementation. Basic boundary tests are required; broad device benchmarking is recommended. Start with Floyd–Steinberg at 4 bits per channel to preserve the current default. Do not silently migrate saved settings if settings persistence is added later; this release does not persist image data or edit settings across reloads.
