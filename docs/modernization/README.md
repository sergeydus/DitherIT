# DitherIT modernization specifications

Prepared 2026-10-22. Status: M0 rendering and M1 import/lifecycle are implemented; the remaining modernization roadmap is proposed. The deployment push filter targets `master`; verify it on the first push-triggered run.

DitherIT should become a focused, accessible image workshop: open a local image, understand the effect, compare the result, and export exactly what the interface promises. Keep the small static application and local processing model. Prioritize trustworthy output and responsive interaction alongside the visual redesign.

## Specification set

| Document | Purpose |
| --- | --- |
| [01 — Product and current-state audit](01-product-and-audit.md) | Source-backed findings, goals, scope, and success measures |
| [02 — UI, UX, and accessibility](02-ui-ux-and-accessibility.md) | Layouts, workflows, component behavior, visual tokens, and inclusive interaction |
| [03 — Processing and technical architecture](03-processing-and-architecture.md) | Rendering contracts, input limits, concurrency, export, and deployment |
| [04 — Delivery and acceptance](04-delivery-and-acceptance.md) | Dependency-ordered work packages, verification scenarios, and release gates |
| [05 — M1 implementation](05-m1-implementation.md) | Built import/worker lifecycle, interpretation choices, tests, and remaining coverage |

Requirement IDs are stable across the documents. **P0** means necessary for a trustworthy foundation; **P1** completes the modernized experience; **P2** is a later candidate. Complete P0 and P1 behavior before calling the modernization release complete. The [requirements matrix](04-delivery-and-acceptance.md#requirements-and-evidence) maps every ID to a work package, acceptance tests, and an evidence slot. Required release checks and recommended research/device studies are explicitly separated in that document.

## Proposed decisions

- Use a preview-first workspace with a desktop inspector and a single-column mobile flow.
- Keep Next.js, React, TypeScript, Tailwind, static export, and GitHub Pages. A framework migration is outside this plan.
- Keep image bytes in the browser; add no accounts, image service, or analytics by default.
- Correct Original mode, export fidelity, color terminology, and processing lifecycle before adding more effects.
- Use one rendering contract for the displayed result and downloaded PNG, with worker-based processing and stale-result protection.
- Preserve post-dither softening, rendered into pixels; default to a clearly labeled 2048 px longest-edge output cap, with Original dimensions opt-in and 1:1 inspection.
- Move resize/readback/pixel writes off-thread with ImageBitmap and OffscreenCanvas, and encode PNG directly from committed RGBA bytes in an export worker; interrupt obsolete renders and keep exports independent of render cancellation.
- Cache the resized baseline in the controller by source/output dimensions; clone it to each render worker without transferring the cached bitmap, so effect changes reuse preparation and the Original comparison view.
- Preserve GIF/AVIF/BMP import where supported, normalize animated inputs to a still frame, and avoid adding an animation-rejection parser.
- Ship dark and light themes, keyboard access, a built-in sample, presets, and original/result comparison.

These are product proposals, not claims of completed implementation. Basic limit/cancellation checks are required; multi-device p95 benchmarking, usability studies, and NVDA/VoiceOver studies are recommended follow-up evidence. The audit uses repository source and verified GitHub branch/run metadata, not browser observation or measured performance. No WCAG conformance claim follows from automated checks alone.

## Boundaries

M0 and M1 are implemented; specification 05 records the checks and their limits. M2–M5 remain subject to their acceptance criteria. The visual workspace designs in specification 02 are proposals, and accessibility conformance is not claimed.
