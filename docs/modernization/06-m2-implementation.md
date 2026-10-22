# M2 — Settings, output and accessibility implementation

M2 implements UX-03, EXP-01–02 and the A11Y-01 portion of AC-20 on the existing M1 controller and visual layout. The M3 workspace/theme redesign and M4 exploration controls remain separate.

## Implementation and evidence

- [Editor controls](../../src/components/ImageDithering.tsx) use native selects, a 1–8 bits/channel slider and synchronized numeric entry, method descriptions, honest pre-soften color bounds, a Filters fieldset and post-dither soften help. Original disables reduction/soften while retaining their values. Reset restores defaults and Standard sizing in one controller transaction without replacing the source.
- [Numeric drafts](../../src/components/CommittedNumberInput.tsx) allow blank text without changing committed settings. Depth now applies valid integers immediately while typing, with the same render debounce as the slider; width and detail coordinates still commit on Enter or blur. Invalid commits restore the last valid value and leave adjacent, associated guidance. External slider/reset/source updates replace earlier drafts permanently. Width accepts 1 through source width, derives height from aspect ratio, and prevents upscaling.
- Output controls expose Standard, Original dimensions and Custom width. Source and selected output dimensions are separate; reduced output is disclosed as the actual PNG size. A persistent export summary, selected filename, soften/alpha notice and separately labeled last-rendered settings distinguish pending controls from committed pixels.
- Import/export failures have associated alerts; numeric and render errors remain inline. The controller adds error-action metadata and a reset transaction while retaining M1 worker ownership, stale-reply checks and export snapshots. Export retry clears the prior export failure.
- One polite, atomic status region settles for 250 ms before announcing progress/results, reset, source-width clamping or download initiation. Visible status stays immediate. Export remains focusable after import with `aria-disabled` plus an activation guard while unavailable, preserving keyboard focus during encoding and blocking duplicates. Download success means the browser handoff began, not that a file was saved.
- [M2 browser tests](../../tests/browser/m2.browser.ts) cover AC-10, AC-11, AC-12 and A11Y-01/AC-20. They exercise transient blanks and invalid commits, slider/draft synchronization, Original retention, reset, landscape/portrait/small output dimensions, independently decoded PNGs, stale summaries, snapshot completion after source/settings changes and cancel, duplicate prevention, deferred URL revocation, failure recovery, keyboard-only import/edit/export, focus retention and debounced announcements.
- Axe runs against the full page in empty, ready, processing, numeric-error and import-error states, with no WCAG-tagged violations. The test worker probe holds delivery from real workers for deterministic busy/export races; it does not substitute an encoder or processor. Next.js's built-in route announcer lies outside the editor's alert assertions.

## Interpretation choices

1. Depth applies valid whole numbers **while typing**; Enter or blur validates an unfinished draft. Other numeric fields commit on **Enter or blur**. Blank/invalid drafts never invalidate an already committed render; invalid completion restores the last valid value and guidance persists until editing, reset or an external value change. No modal or alert is used for numeric validation.
2. The first Custom width selection uses the current output width; subsequent selections reuse the previous custom width, clamped to the current source. Reset returns to Standard and the default effect settings. M4 preserves the current seed across Reset so only New variation changes it; see specification 08 for that extension.
3. The export summary/filename describe selected controls; the separately labeled rendered summary describes the retained result. Export eligibility continues to depend on the controller's committed matching render. Original keeps the existing filename method token `none` and omits depth.
4. Accessibility checks cover the current dark layout. A second theme, full reflow/forced-colors coverage and exploration controls belong to M3/M4. NVDA/VoiceOver and real-device studies remain recommended and unperformed; axe and keyboard tests do not establish WCAG conformance.

## Verification

- `npm run lint`, `npx tsc --noEmit`, `npm test` (121 Node tests) and `npm run build`.
- After building, `npm run test:browser` runs 14 tests (six M1 and eight M2) against the actual static `/DitherIT/` output, including the axe states above. Install the Playwright browser with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium-based browser such as Edge. Restricted runners may use the separate static-server procedure in [M1 notes](05-m1-implementation.md).
