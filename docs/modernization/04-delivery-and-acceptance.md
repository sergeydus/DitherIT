# 04 — Delivery plan and acceptance criteria

## Work packages

Implement in dependency order. Each package should be reviewable on its own. P0 correctness/accessibility work precedes P1 experience enhancements; the complete release includes both. No engineering estimate is asserted without implementation discovery.

**Independent QA-01 maintenance fix:** the `deploy.yml` push filter targets `master`, with manual dispatch retained. This correction has no M0–M5 dependency and can ship independently. Verify it on the first push-triggered run; M5 checks the filter alongside the remaining CI work.

| Package | Priority / depends on | Deliverable | Exit evidence |
| --- | --- | --- | --- |
| M0 — Render correctness | P0 / none | IMG-01–04: true Original, post-dither Gaussian soften, byte-based diffusion error, quantization-aware noise, stable seeds | Algorithm fixtures, pixel/alpha assertions; before/after gallery recommended |
| M1 — Import and lifecycle | P0 / M0 | IN-01, PERF-01–02, ARCH-01: raster decoding, controller-owned resized-baseline cache, cloned input per effect worker, supersession/cancel/cleanup | Cache reuse and invalidation, input recovery, rapid settings/source replacement, worker failure; broad profiling recommended |
| M2 — Honest controls and output | P0 / M1 | UX-03, EXP-01–02, A11Y-01: labels, color/soften copy, Standard output sizing, independent snapshot export, status/error messaging | Keyboard core workflow, preview/export pixel parity, cancellation without settings rollback, export completing across edits |
| M3 — Workspace and foundations | P1 / M2 | UX-01, UI-01–02, A11Y-02: responsive workspace, tokens, themes, typography, metadata | Desktop/mobile screenshots, contrast review, reflow/zoom/forced-colors checks |
| M4 — Exploration tools | P1 / M3 | UX-02, UX-04–05: sample, presets, reset, seeded variation, comparison, 1:1 detail/zoom/pan, help | Keyboard/touch workflow; screen-reader study recommended |
| M5 — Release validation | P0 gate + P1 completion / M0–M4 | QA-01, ARCH-02: CI gates, verification of the independent `master` push-filter fix, static-path smoke checks, updated user docs | Required evidence linked below; recommended studies tracked separately |

Introduce focused algorithm tests with M0 and orchestration tests with M1 rather than deferring all testing to M5. Add CI gates as the corresponding suites become available. Visual changes must not hide unresolved P0 output defects.

## Requirements and evidence

This is the single requirement register. Every P0/P1 row needs implementation and required-test evidence before release; **Pending** is a placeholder, not a pass. Replace it with concrete PR/artifact/run links as work lands. Acceptance scenarios below are required behavior checks; recommended studies have separate tracking and do not block these rows. P2 candidates remain in specification 01 and have no release evidence requirement.

| ID | Requirement | Priority | Work package | Acceptance tests | Implementation / required evidence |
| --- | --- | --- | --- | --- | --- |
| <a id="req-in-01"></a>IN-01 | Validated import, compatibility and recovery | P0 | M1 | [AC-06](#ac-06), [AC-07](#ac-07), [AC-17](#ac-17) | [M1 implementation and verification](05-m1-implementation.md) |
| <a id="req-img-01"></a>IMG-01 | True Original bypass | P0 | M0 | [AC-01](#ac-01) | [Pure core](../../src/utils/dithering.ts), [Node fixtures](../../src/utils/dithering.test.ts); [M2 browser/export verification](06-m2-implementation.md) |
| <a id="req-img-02"></a>IMG-02 | Exported post-dither soften and alpha | P0 | M0 | [AC-02](#ac-02), [AC-04](#ac-04) | [Pure core](../../src/utils/dithering.ts), [Gaussian fixtures](../../src/utils/dithering.test.ts), [M1 committed-buffer PNG smoke](../../tests/browser/m1.browser.ts); [M2 controls/export verification](06-m2-implementation.md) |
| <a id="req-img-03"></a>IMG-03 | Float diffusion against emitted bytes | P0 | M0 | [AC-03](#ac-03) | [Pure core](../../src/utils/dithering.ts), [byte-error/boundary fixtures](../../src/utils/dithering.test.ts) |
| <a id="req-img-04"></a>IMG-04 | Depth-aware deterministic output | P0 | M0 | [AC-04](#ac-04), [AC-05](#ac-05) | [Pure core](../../src/utils/dithering.ts), [seed/depth fixtures](../../src/utils/dithering.test.ts); [M4 seed/view/export workflow](08-m4-implementation.md) |
| <a id="req-perf-01"></a>PERF-01 | Off-thread pixel work, baseline reuse and usable controls | P0 | M1 | [AC-09](#ac-09), [AC-21](#ac-21), [AC-23](#ac-23) | [M1 implementation and verification](05-m1-implementation.md); device p95 study recommended |
| <a id="req-perf-02"></a>PERF-02 | Supersession, cancel, stale-result protection | P0 | M1 | [AC-08](#ac-08), [AC-09](#ac-09), [AC-17](#ac-17) | [M1 lifecycle and cleanup tests](../../src/lib/image-processor.test.ts) |
| <a id="req-ux-01"></a>UX-01 | Responsive preview-first workspace | P1 | M3 | [AC-22](#ac-22) | [M3 implementation and verification](07-m3-implementation.md) |
| <a id="req-ux-02"></a>UX-02 | Sample and first-use guidance | P1 | M4 | [AC-13](#ac-13) | [M4 implementation and verification](08-m4-implementation.md) |
| <a id="req-ux-03"></a>UX-03 | Honest labeled settings and validation | P0 | M2 | [AC-10](#ac-10), [AC-20](#ac-20) | [M2 implementation and verification](06-m2-implementation.md) |
| <a id="req-ux-04"></a>UX-04 | Presets, reset, seeded variation | P1 | M4 | [AC-05](#ac-05), [AC-13](#ac-13) | [M4 implementation and verification](08-m4-implementation.md) |
| <a id="req-ux-05"></a>UX-05 | Comparison, zoom/pan and 1:1 detail | P1 | M4 | [AC-14](#ac-14), [AC-23](#ac-23) | [M4 implementation and verification](08-m4-implementation.md) |
| <a id="req-exp-01"></a>EXP-01 | Disclosed Standard/default and opt-in dimensions | P0 | M2 | [AC-11](#ac-11) | [M2 implementation and verification](06-m2-implementation.md) |
| <a id="req-exp-02"></a>EXP-02 | Immutable export snapshots and download lifecycle | P0 | M2 | [AC-02](#ac-02), [AC-12](#ac-12) | [M2 implementation and verification](06-m2-implementation.md) |
| <a id="req-ui-01"></a>UI-01 | Visual tokens, typography and themes | P1 | M3 | [AC-15](#ac-15), [AC-22](#ac-22) | [M3 implementation and verification](07-m3-implementation.md) |
| <a id="req-ui-02"></a>UI-02 | Product metadata and assets | P1 | M3 | [AC-19](#ac-19) | [M3 implementation and verification](07-m3-implementation.md) |
| <a id="req-a11y-01"></a>A11Y-01 | Core labels, keyboard and status semantics | P0 | M2 | [AC-20](#ac-20) | [M2 implementation and verification](06-m2-implementation.md) |
| <a id="req-a11y-02"></a>A11Y-02 | Accessible exploration and responsive visuals | P1 | M3, M4 | [AC-14](#ac-14), [AC-20](#ac-20), [AC-22](#ac-22) | [M3 responsive/theme verification](07-m3-implementation.md); [M4 exploration verification](08-m4-implementation.md) |
| <a id="req-arch-01"></a>ARCH-01 | Client-only static architecture, worker/cache ownership | P0 | M1 | [AC-16](#ac-16), [AC-21](#ac-21), [AC-23](#ac-23) | [M1 implementation](05-m1-implementation.md), [static browser smoke suite](../../tests/browser/m1.browser.ts) |
| <a id="req-arch-02"></a>ARCH-02 | Maintenance, user docs and production assets | P1 | M5 | [AC-16](#ac-16), [AC-18](#ac-18), [AC-19](#ac-19) | Pending |
| <a id="req-qa-01"></a>QA-01 | CI regression gates and correct push branch | P0 | Independent trigger fix; CI in M0–M5 | [AC-16](#ac-16), [AC-18](#ac-18), [AC-20](#ac-20) | Push filter [targets master](../../.github/workflows/deploy.yml); remaining gates Pending |

## Functional acceptance scenarios

| ID | Given / action | Expected result |
| --- | --- | --- |
| <a id="ac-01"></a>AC-01 (IMG-01) | Decode an opaque 3 × 2 fixture; set depth to 1 and soften on, then switch to Original at source dimensions | Render equals decoded source pixels; retained effects bypassed; Original PNG decodes to the same pixels |
| <a id="ac-02"></a>AC-02 (IMG-02, EXP-02) | Dither then soften a high-contrast/transparent fixture; export Result and Split views | Output matches post-dither Gaussian reference (a fixture distinguishes pre-blur from post-blur); both exports equal the committed result including alpha and intermediate colors; no CSS-only blur or split composition |
| <a id="ac-03"></a>AC-03 (IMG-03) | Run tiny edge/corner fixtures and a 3-bit fractional-level fixture | Valid neighbors only, source unchanged; error uses `oldValue - round(level * q)` (e.g. 50 → byte 36, error 14 at level 1), not the unrounded level; match float reference |
| <a id="ac-04"></a>AC-04 (IMG-04) | Run every method at 1, 3, 4, and 8 bits/channel, soften off/on | Byte-range output; 8-bit output is baseline then optional soften; alpha obeys contract; deterministic outputs repeat; 8-bit Ordered has no added noise |
| <a id="ac-05"></a>AC-05 (IMG-04, UX-04) | Use Random, export twice, switch views/theme, then New variation | Fixed seed repeats pixels; view/theme do not reprocess; explicit variation changes seed/result |
| <a id="ac-06"></a>AC-06 (IN-01) | Corrupt PNG, disguised SVG, empty file, multiple files, over-limit bytes/dimensions | Specific recovery errors retain good source/result; byte rejection before decode; dimension rejection before full canvas/readback allocation; no repeated decode loop; unavoidable decoder allocation limitation documented |
| <a id="ac-07"></a>AC-07 (IN-01) | Oriented JPEG, transparent PNG, empty-MIME WebP, BMP, GIF and AVIF (including animated fixtures), reselect same file | Orientation correct once, alpha retained; first/default frame stable across re-renders; no animation rejection parser; a decoder-unsupported type reports a recoverable error rather than crashing |
| <a id="ac-08"></a>AC-08 (PERF-02) | Slow job A, rapid slider changes, then import B; inject late replies | Obsolete worker terminated on supersession; latest debounced request starts without waiting for A; only latest B commits; old replies cannot clear busy state |
| <a id="ac-09"></a>AC-09 (PERF-01–02) | Change settings during slow render; cancel; Render preview; simulate worker failure | Current settings/output remain selected; last image labeled “Preview out of date”; export disabled until retry commits; controls work and failure has no restart loop |
| <a id="ac-10"></a>AC-10 (UX-03) | Set depth 1/4/8 by slider/numeric input; enter blank/fraction/9; toggle soften | Correct pre-soften levels/color bounds and extra-color notice; post-dither description; invalid commits restore last valid value with guidance |
| <a id="ac-11"></a>AC-11 (EXP-01) | Import 2400 × 1600; export Standard, Original, Custom width 1200; also test 1600 × 2400 and 800 × 600 inputs | Sizes 2048 × 1365, 2400 × 1600, 1200 × 800; portrait default 1365 × 2048; small input unchanged; visible actual dimensions; no hidden draft/export resolution |
| <a id="ac-12"></a>AC-12 (EXP-02) | Export before ready/in debounce gap; double click; change settings/source and cancel render during encoding; simulate encode failure | No uncommitted export or duplicate; clicked snapshot still finishes with its original pixels/name despite later edits; render termination leaves export worker alive; encoder errors recover; URL remains valid through handoff and is revoked on deferred cleanup |
| <a id="ac-13"></a>AC-13 (UX-02, UX-04) | Try sample, preset, manual depth, reset, then replace source | Licensed local sample; atomic preset, Custom on manual change; reset retains source, selects Balanced effect preset and Standard output size; replacement retains settings/mode with documented Custom-width clamp |
| <a id="ac-14"></a>AC-14 (UX-05) | Toggle views/split, zoom/pan, enable 1:1 detail; move crop by keyboard/touch including image edges | Aligned comparison; no render jobs from view changes; output-pixel detail crop accurate, labeled stale if needed, usable without hover/drag |
| <a id="ac-15"></a>AC-15 (UI-01) | System/Light/Dark, reload, unavailable storage | Correct readable tokens and applied typography; theme persists where supported; storage failure harmless; image pixels unchanged |
| <a id="ac-16"></a>AC-16 (ARCH-01, QA-01) | Serve `out` under `/DitherIT/`, refresh and run full workflow | Render/export worker chunks and local assets resolve; no server endpoint/image transmission; pixel download and error recovery work |
| <a id="ac-17"></a>AC-17 (IN-01, PERF-02) | Repeated import/replace/cancel then unmount, using cleanup instrumentation | Worker/bitmap/URL/listener lifetimes closed; obsolete buffers unreferenced; clicked export only retained until completion/teardown; broad heap profiling recommended separately |
| <a id="ac-18"></a>AC-18 (QA-01, ARCH-02) | Inspect/test updated CI event filters and gates without publishing | Push filter accepts `master`, not nonexistent `main`; manual dispatch retained; lint/type/tests/axe/static-path checks/build precede deploy; README documents actual defaults/formats/limits |
| <a id="ac-19"></a>AC-19 (UI-02, ARCH-02) | Build and inspect page head, favicon and referenced assets | Product title/description, fonts, local product mark and sample assets load under the base path; no referenced assets removed |
| <a id="ac-20"></a>AC-20 (A11Y-01–02) | Complete keyboard workflow; inspect labels/status/focus; run axe in empty/ready/busy/error and both themes | All controls named, Filters uses heading/legend, status/errors associated, no keyboard trap or obscured focus; no unresolved serious/critical axe findings |
| <a id="ac-21"></a>AC-21 (PERF-01, ARCH-01) | Inspect/instrument render and export paths; simulate missing APIs | Resize/getImageData/putImageData run in workers via OffscreenCanvas; PNG encoding runs directly from committed RGBA bytes in a worker via CompressionStream; UI only presents bitmaps; unsupported API errors actionable; no unrestricted synchronous fallback |
| <a id="ac-22"></a>AC-22 (UX-01, UI-01, A11Y-02) | Representative states at narrow/desktop widths, zoom/text spacing, reduced motion and forced colors | No page-level horizontal overflow at 320 px; focus/controls/contrast readable in both themes; workspace hierarchy and tokens match spec |
| <a id="ac-23"></a>AC-23 (PERF-01, ARCH-01, UX-05) | Instrument preparation on a 16 MP source; change depth/method/soften/seed repeatedly, terminate/restart effect workers, then change output dimensions/source | Effect-only changes do not decode or resize again; controller bitmap remains valid after worker termination and is cloned without transfer; Original comparison identity remains stable for the baseline key. Source/size changes prepare a new baseline once, reject stale preparation replies and switch aligned Original/Result together; obsolete cache entries close when unused |

For output equality, compare decoded pixel data, not compressed PNG bytes, since encoders and metadata can differ. Use within-browser rendering comparisons for browser-resampled inputs. Unit-test pure algorithms with fixed RGBA fixtures independent of browser image decoding.

## Algorithm fixture set

Use small synthetic fixtures for exact assertions: 1 × 1 and 1 × N edges, 2 × 2 corners, gradients, opaque primaries, 3-bit fractional quantization levels, and transparent/partially transparent colored edges. Include a fixture distinguishing post-dither blur from pre-dither blur. A licensed photo/illustration/pixel-art gallery is recommended visual evidence. Fix the PRNG seed and algorithm version in golden tests; do not auto-approve changed snapshots.

At source-size Original, compare decoded pixels with the source buffer; for fully transparent pixels accept the decoder's canonical representation. For softened transparency, use the defined premultiplied Gaussian reference. Test invalid bit depths and unknown method IDs at the processing boundary.

### M0 implementation boundary and interpretation choices

The [pure RGBA core](../../src/utils/dithering.ts) accepts `{ width, height, data }` and optional `{ seed, soften }`; it returns separately owned RGBA bytes without browser APIs. The [Node fixtures](../../src/utils/dithering.test.ts) cover the pixel-processing portions of AC-01–04. [M1 integration](05-m1-implementation.md) runs the core in a worker, wires pixel softening instead of CSS blur, and adds decoding/PNG parity smoke checks. Full settings/output and broader UI acceptance remain in later packages.

- `ALGORITHM_VERSION = 1` identifies the first pure contract. Random uses Mulberry32, defaults to unsigned 32-bit seed 0, and consumes one draw per RGB channel at every pixel, including fully transparent ones; alpha consumes none. This keeps the noise sequence stable when only an alpha mask changes.
- Transparent/off-image diffusion destinations lose their weights without renormalization. Hidden RGB is preserved when soften is off; fully transparent pixels neither receive nor emit diffusion error. Partially transparent pixels process straight RGB and retain alpha before soften.
- Gaussian accumulation uses Float64 premultiplied color/alpha. Unpremultiplication uses unrounded accumulated alpha, then emitted channels/alpha use `Math.round`; if emitted alpha rounds to zero, RGB is zeroed too. Two/three-row diffusion buffers and a seven-row horizontal Gaussian cache bound intermediate storage by width.
- Invalid bit depths are rejected even in Original/8-bit bypass paths. Seeds must be unsigned 32-bit integers; dimensions must be positive safe integers with an exact matching Uint8ClampedArray byte count. Image import size limits are intentionally outside the core.
- Vitest 4 keeps the test runner compatible with the workflow's Node 20 runtime. `npm test` runs once in Node; no DOM shim or browser dependency is required.

## Required release checks

| Check | Required evidence |
| --- | --- |
| Responsive layout | Empty, ready, processing, and error screenshots at 320, 390, 768, 1024, and 1440 CSS px; portrait and landscape mobile |
| Keyboard | Import/sample, settings, comparison, zoom/pan, reset, help, output width, and export completed without pointer; visible focus throughout |
| Visual accessibility | Contrast matrix for both themes, forced-colors inspection, reduced motion, 200% text, adjusted spacing, 400% zoom/reflow |
| Pixel parity and lifecycle | Algorithm/output, supersession/cancel, snapshot export and input recovery scenarios above |
| axe | Empty/ready/busy/error, both themes: no unresolved serious/critical findings; manually triage findings; score alone is not conformance |
| Static-path and CI smoke test | Actual exported artifact at `/DitherIT/` and event-filter checks proving `master` is configured; no deployment required for this check |

Use Playwright or equivalent browser automation and adopt axe-core for the required automated accessibility check during implementation; these are not current dependencies. A separate end-to-end test per styling token is unnecessary; use representative screenshots and meaningful workflows. Required evidence may use one supported desktop engine with narrow and desktop viewports; broader compatibility work is recommended below. Known core-workflow failures remain blockers regardless of which check discovers them.

## Recommended follow-up evidence

| Study | Evidence to record | Status |
| --- | --- | --- |
| Formative usability | Five-person first-use task from spec 01; completion/obstacles, no private image collection | Not yet performed |
| NVDA and VoiceOver | Names/values, announcements, disabled explanations, comparison/detail inspection and focus behavior | Not yet performed |
| Multi-device p95/heap study | Desktop/mobile browsers, 1/4/16 MP plus Standard default; preparation/cache-hit/clone breakdown, interruption cost and memory | Not yet performed |
| Full browser/touch matrix and gallery | Target desktop/mobile versions, touch interactions and representative photo/art review | Not yet performed |

These studies do not block release merely because unavailable. Record unperformed work and any known limitations in release notes; do not claim measured performance or WCAG conformance. A defect discovered during a recommended study is triaged by impact, not ignored because the study was optional.

## Build and deployment verification

CI should install from the lockfile, run ESLint, perform explicit TypeScript checking, run algorithm/lifecycle/workflow suites and accessibility checks, then build the static artifact. Available scripts include `test` (Node fixtures/lifecycle/worker-operation tests), `test:browser` (production static smoke tests) and `bench` (manual only), alongside `dev`, `build`, `start`, and `lint`. Axe and CI wiring remain separate implementation work.

Serve `out` through a local static server mounted under the production base path. Check direct navigation, refresh, fonts, favicon, sample load, module worker startup, image import, error recovery, comparison, and PNG download. Verify no hardcoded root paths or dependency on runtime Next.js server features. Publishing to Pages is a separate operational action, not part of these specs.

QA-01's push filter targets `master`, with manual dispatch retained. The correction can ship independently of M0–M5. Check the branch-filter portion of AC-18 separately from the remaining CI requirements, and verify it on the first push-triggered run. Link that run as evidence when available; publishing is not required for the local smoke-test gate.

Benchmark using the recommended method in specification 03 when devices are available; timings/p95 thresholds are investigation targets, not hard release gates or measured achievements.

## Required release checklist

- [Requirements matrix](#requirements-and-evidence): every P0/P1 row links implementation and required-test evidence; no Pending row is represented as passed.
- [IMG-01](#req-img-01), [IMG-02](#req-img-02), [IMG-03](#req-img-03), [IMG-04](#req-img-04), [EXP-01](#req-exp-01), [EXP-02](#req-exp-02): exact algorithm/parity and snapshot tests pass at disclosed dimensions.
- [IN-01](#req-in-01), [PERF-01](#req-perf-01), [PERF-02](#req-perf-02): input limits, worker supersession, cancel without rollback, cleanup and error recovery pass.
- [A11Y-01](#req-a11y-01), [A11Y-02](#req-a11y-02), [UX-01](#req-ux-01), [UX-05](#req-ux-05), [UI-01](#req-ui-01): keyboard, axe, responsive/theme checks and 1:1 inspection pass.
- [UX-02](#req-ux-02), [UX-03](#req-ux-03), [UX-04](#req-ux-04): sample provenance, honest copy, presets/reset and first-use guidance implemented.
- [ARCH-01](#req-arch-01), [ARCH-02](#req-arch-02), [UI-02](#req-ui-02), [QA-01](#req-qa-01): production static path/assets work, `master` push filter and CI gates correct, README updated.
- [Recommended studies](#recommended-follow-up-evidence) have explicit performed/outstanding status and known limitations; missing studies alone do not block release.

## Risks and follow-up decisions

| Risk | Mitigation / decision point |
| --- | --- |
| Opt-in full-resolution buffers strain mobile memory | Standard default caps longest edge at 2048 px; preserve explicit dimensions and cancellation; broader profiling recommended |
| Algorithm corrections alter familiar output | Preserve algorithm names, version fixtures, and show reviewed before/after samples in release notes |
| Preview/export mismatch returns through separate render paths | One committed render contract; pixel-equality regression tests in M2 |
| Too many controls overwhelm first use | Keep defaults useful, group settings, show method-specific help, and validate the first-use task |
| Worker bundling or assets break at the Pages subpath | Verify the actual production static artifact in M1 and again at M5 |
| Proposed tokens or breakpoints fail with real content | Measure contrast and test long filenames, zoom, touch, and assistive technology during M3 |
| Import parsing expands scope | Preserve six raster formats through browser decoding, bound any dimension reader, avoid animation rejection parsing, disclose decode allocation limits |
| Worker restart or bitmap presentation consumes reusable input | Controller owns resized baseline; structured-clone per job without transfer, preserve Original comparison across effect changes, close only unused cache entries; validate with AC-23 |
| Optional studies leave unknown accessibility/performance gaps | Track gaps without conformance/performance claims; triage any known defect by impact |

P2 features remain outside the release gate. They should not displace correctness, accessibility, or output-fidelity work.
