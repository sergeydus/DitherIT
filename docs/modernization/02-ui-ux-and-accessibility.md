# 02 — UI, UX, and accessibility specification

## Information architecture and layout — UX-01 (P1)

Retain a single editor route. The product header contains the DitherIT wordmark, short descriptor “Image dithering studio,” theme selector, and Help disclosure. The workspace contains an image source summary, preview/comparison area, inspector, output summary, and primary Export PNG action. Move the current always-visible algorithm explanations into contextual help and an expandable guide after the workspace.

Desktop, viewport at least 1024 CSS px: max content width 1440 px, centered with 24 px gutters. Use `minmax(0, 1fr)` for the preview column and a 320 px inspector with a 24 px gap. Allow normal page scrolling; no fixed-height editor shell. A sticky inspector is permitted only where its full content fits below the header and remains keyboard-visible.

Tablet and mobile, below 1024 px: use one column, 24 px gutters on tablet and 16 px below 640 px. Order source actions, preview, view controls, inspector sections, output summary, export, guide. Keep the preview initially about 40vh, with a 240 px minimum and a 560 px maximum; allow natural expansion under text zoom. Avoid a bottom sheet or a fixed export bar that could obscure content.

Conceptual wireframes (structure only; no working UI is introduced by these specs):

```text
Desktop
┌ DitherIT / Image dithering studio ───────── Theme ─ Help ┐
│ filename · source size · Replace image                   │
├───────────────────────────────────┬─────────────────────┤
│ Original / Result / Split         │ Look                │
│                                   │ Preset              │
│         IMAGE WORKSPACE           │ Method + short help │
│     transparent checkerboard      │ Bits per channel    │
│                                   │ Soften pattern      │
│ Fit / 100% / zoom · render status  │ Reset settings      │
│                                   │ Output dimensions   │
│                                   │ [ Export PNG ]      │
└───────────────────────────────────┴─────────────────────┘
  Expandable guide · local-processing statement

Mobile
┌ DitherIT ───────────────────── Theme / Help ┐
│ Source summary / Replace image             │
│ Original / Result / Split                  │
│              IMAGE PREVIEW                 │
│ Fit / 100% / zoom · render status           │
│ Look / Method / Bits per channel / Soften   │
│ Reset settings                             │
│ Output dimensions / Export PNG             │
│ Expandable guide                           │
└────────────────────────────────────────────┘
```

Use the same meaningful DOM order on every breakpoint; desktop placement uses CSS grid. At 320 px, filenames truncate visually with an accessible full name; buttons and labels wrap. Image panning can scroll inside its own labeled viewport at 100% zoom without introducing page-level horizontal scrolling.

## Import and first use — IN-01 (P0), UX-02 (P1)

Empty preview: heading “Make something out of fewer colors.” Supporting text: “Choose a photo or illustration, then try a dithering style.” Actions: **Choose image** and **Try a sample**. Show “PNG, JPEG, WebP, GIF, AVIF, BMP · browser support varies · up to 20 MiB · 16 megapixels” and “Images are processed in your browser.” Supporting help states “Animated images become a still image (first/default frame).” Drag-and-drop is an enhancement with an equally capable file picker; never require dragging.

Ship one locally bundled, licensed sample that includes gradients, fine edges, and texture. Record its provenance/license in the repository; avoid remote requests. The sample must obey the same import and processing path as a user image. Its accessible name identifies it as a sample.

On valid import, retain current effect settings and output-size mode, reset image zoom to Fit and split position to 50%, show source and proposed output dimensions, and start rendering. First import uses Standard size (longest edge at most 2048 px). Recalculate Standard/Original dimensions for the new source; if retained Custom width exceeds its width, clamp to the new source width with an announcement. The file picker accepts one image; multi-file drops are rejected with “Choose one image at a time.” Canceling the picker leaves state intact. Re-selecting the same file must work.

During replacement, keep the previous image visible until the new source has decoded and passed validation. A failed replacement retains the previous settings and exportable result. On successful replacement, invalidate old processing, render the new source, and announce its name/dimensions without moving keyboard focus. Refer to specification 03 for supported decoding rules and limits.

## Settings and presets — UX-03 (P0), UX-04 (P1)

Use native controls wherever possible. Every control has a persistent visible label, programmatic association, and optional helper text. Group Filters with a heading or fieldset legend, never an unattached `label`. Disable image settings before an image is available with nearby text explaining that an image is required; leave theme, help, and import available.

| Control | Required behavior |
| --- | --- |
| Method | Native select with Original, Floyd–Steinberg, Atkinson, Ordered (Bayer), Random, and Threshold. Show one sentence describing the selected method. |
| Bits per channel | Integer range 1–8, default 4, with a synchronized numeric input and visible current value. State “16 levels/channel · up to 4,096 RGB colors” at 4. At 1, show “2 levels/channel · up to 8 RGB colors.” Explain that this is not PNG file bit depth or a guarantee of unique colors. |
| Soften dither pattern | Checkbox, default off. Help: “Apply a 1 px blur after dithering, at output resolution. Adds intermediate colors and softens transparent edges.” Render it into the exported pixels. This preserves the existing post-dither effect order; pre-dither blur is outside scope. |
| Original selected | Disable bits and soften, retain their previous values, and say “Color reduction and softening are bypassed.” Output sizing still applies. Returning to a processed method restores the retained values. |
| Reset settings | Restore Floyd–Steinberg, 4 bits/channel, soften off, and Standard output size; retain the source and view position. Announce “Settings reset.” No confirmation dialog. |

Valid whole-number depth edits apply while typing, synchronizing the slider and color count immediately and using the slider's render debounce. Permit transient blank or invalid drafts without changing the last valid depth; Enter or blur restores that value with inline guidance. Sliders and numeric entry update the same state. Show total possible colors as a pre-soften upper bound excluding alpha; when soften is on, append “Before softening; final image may contain more colors.”

Presets are a labeled native select or a clearly labeled set of buttons. Proposed presets: **Balanced** (Floyd–Steinberg, 4 bits/channel, soften off), **Classic texture** (Atkinson, 1, off), **Ordered texture** (Ordered, 2, off), **Soft grain** (Random, 2, on). Explain that these retain RGB color. Choosing a preset updates settings in one transaction and never changes output dimensions. Manual changes mark the preset **Custom**. Presets remain disabled before import.

Random uses a stable seed for the current image. A **New variation** button appears only for Random, explicitly changes the seed, and announces the new result when ready. Other control changes, presets, imports and Reset settings retain the seed; they must not silently randomize the pattern. New variation advances the unsigned 32-bit seed by one, wrapping at its limit. At 8 bits the selected seed changes but noise remains bypassed.

## Preview, comparison, and status — UX-05 (P1), PERF-02 (P0)

Provide a labeled view group: Original, Result (default), Split. These are radio buttons with native arrow-key behavior. View switching does not reprocess. Comparison uses the source resized to the selected output dimensions and the current processed output, with matching scale and alignment. “Original” in this group is a viewing option, distinct from choosing Original as the processing method.

The Original comparison bitmap is cached by source/output dimensions and remains unchanged across method, depth, soften, seed, preset, or reset changes that leave that key unchanged. Preparing a different source/size updates it only when the matching result can be shown; retain the previous Original/Result pair together while updating.

Split displays a labeled range control “Comparison position,” 0–100%, default 50%, with original on the left and result on the right. Render a visible divider; allow both range input and optional dragging. At narrow widths the control stays below the preview. Original and Result views provide an equivalent comparison path without dragging.

Provide Fit, 100%, zoom out, and zoom in controls. Zoom presets: 25%, 50%, 100%, 200%, 400%; Fit is an additional mode. Preserve center when zooming; Fit recenters. Provide scrollable overflow at enlarged views and keyboard-operable horizontal/vertical pan controls when content overflows. Mark the viewport as a named region; do not trap Tab or override browser zoom shortcuts. At 100% and above, use nearest-neighbor display scaling for pixel inspection.

Add a **1:1 detail** toggle with a 160 × 160 CSS px detail pane below the preview, one output pixel per CSS pixel, using nearest-neighbor display. It shows a crop of the current view's committed pixels, centered initially. A pointer/tap may reposition it; labeled horizontal/vertical numeric position controls and arrow buttons provide keyboard/touch alternatives, clamped to valid pixel coordinates. No hover-only interaction is required. Show the selected crop outline on the Fit preview and explain “Fit can hide or alias the dither pattern. Inspect at 1:1.” Detail inspection never reprocesses or changes export dimensions. Clamp the crop at image edges and center smaller images without upscaling. A stale preview's detail pane is labeled stale too.

Canvas alternative text describes the source name, selected method, depth if applicable, and output dimensions. Associate a visible textual summary; do not rely on pixels or canvas fallback text to expose the editing controls.

| State | Presentation and available actions |
| --- | --- |
| Empty | Import/sample invitation; export disabled with explanation |
| Loading source | “Opening image…”; retain prior preview; allow replacement/cancel |
| Processing | Keep last committed result, label it “Updating preview…”; inspector remains operable; export disabled; cancel available |
| Ready | Current result, dimensions, method summary; export enabled |
| Exporting (independent of preview state) | “Preparing PNG for <snapshot filename>…”; prevent duplicate export; allow settings/source changes and finish the already requested snapshot |
| Out of date | Retain the last result with “Preview out of date”; show its rendered-settings summary separately from current controls; export disabled; Render preview action available |
| Recoverable error | Inline error near the failed action; retain last valid result; show Retry and/or Choose another image |

Use one polite status region for settled progress/completion, with debounced announcements during rapid adjustment. Use an alert for import/export failures only. Never move focus merely because processing completes. Do not display fabricated percentages; use an indeterminate indicator unless actual work progress is available.

Cancel during processing terminates active/pending render work and retains the user's current settings, output selection, and validated source. Keep the last committed image if available, label it “Preview out of date,” and offer **Render preview** to explicitly retry current settings. If no render exists, show the same message and action over the source placeholder. Export stays disabled until a matching render commits. A new settings change may resume automatic rendering; no implicit rollback occurs. Canceling render work does not cancel an already clicked export snapshot.

## Export — EXP-01 and EXP-02 (P0)

Output sizing offers **Standard — up to 2048 px** (default, longest edge), **Original dimensions**, and **Custom width**. Standard uses `scale = min(1, 2048 / max(sourceWidth, sourceHeight))`; round each scaled dimension to the nearest integer, at least 1 px. Both sides are capped, so a portrait image cannot defeat a width-only cap. Explicitly show “Resized for faster editing” when applicable; this is the actual output resolution, not a hidden preview draft. Original dimensions is opt-in and warns “Larger images take longer to render.”

These controls are disabled until a validated source is available. Custom width is an integer from 1 to the source width; height is derived from the aspect ratio, rounded to at least 1 px. Allow transient blank input while editing, commit only a valid width, and restore the last valid width with inline guidance on invalid commit. Upscaling and independent height entry are outside this release. Show source size and output size separately. No silent fallback to other dimensions after the user chooses a size.

Show a persistent summary such as “Source 2400 × 1600 px → PNG 2048 × 1365 px · alpha retained” and, when soften is on, “Softening modifies transparent edges.” Export can start only for a committed render matching the selected source, settings, seed, and output size. Snapshot that render and its filename at click time; later edits do not change or cancel it. Suggested filename: `<source-stem>-<method>-<bits>bpc-<width>x<height>.png`; omit depth for Original. Sanitize unusable filename characters and provide `ditherit` as a fallback stem.

Export errors say “We couldn’t prepare the PNG. Try again or choose a smaller output width.” Do not report success until a Blob is created and the browser download is initiated. Do not claim the file was saved to disk, since the browser controls that step. No modal is needed for PNG export.

## Visual language — UI-01 and UI-02 (P1)

Direction: quiet image workshop with neutral surfaces, crisp typography, and a restrained violet accent. Let the image carry the visual interest. Use borders and spacing to distinguish areas; reserve stronger elevation for floating help, if any. Avoid oversized promotional headings inside the working editor.

Proposed semantic tokens (validate all actual pairings during implementation):

| Token | Dark | Light | Usage |
| --- | --- | --- | --- |
| `background` | `#101014` | `#F5F5F8` | Page |
| `surface` | `#1B1B23` | `#FFFFFF` | Inspector and header |
| `surface-muted` | `#24242F` | `#EDEDF3` | Secondary areas |
| `text` | `#F4F4F7` | `#191923` | Primary text |
| `text-muted` | `#B9B9CA` | `#555568` | Helper text |
| `border` | `#72728A` | `#76768C` | Essential control boundaries |
| `accent` | `#C4B5FD` | `#5B21B6` | Links, selection, focus |
| `on-accent` | `#21133F` | `#FFFFFF` | Primary button text |
| `danger` | `#FDA4AF` | `#9F1239` | Errors with text/icon |
| `success` | `#86EFAC` | `#166534` | Success with text/icon |

Use Geist Sans with system fallbacks for UI, and Geist Mono for dimensions and numeric readouts. Actually apply the configured font variables. Base body text 16 px/1.5, control text 14–16 px, helper text at least 13 px/1.5, section labels 16 px/1.4 semibold, product title 24 px/1.2 semibold. Use tabular numerals for dimensions/depth. Spacing scale: 4, 8, 12, 16, 24, 32, 48 px. Radius: 8 px controls, 12 px panels; control height at least 44 px. Use a 2 px focus outline with 3 px offset and ensure it remains visible against adjacent surfaces.

Theme selector has System (default), Light, and Dark. Follow OS changes only in System. Persist only theme preference, tolerate unavailable storage, and avoid a visible incorrect-theme flash without weakening content security unnecessarily. Checkerboard transparency remains a neutral image-viewing surface in both themes. Transitions are 120–180 ms for color/opacity; honor reduced motion by removing nonessential transitions and animated loaders.

Metadata: title “DitherIT — Image Dithering Studio”; description “Explore dithering styles, compare results, and export reduced-color images directly in your browser.” Replace starter favicon with a simple local product mark. Remove unused starter graphics only after verifying they are unreferenced.

## Accessibility — A11Y-01 (P0), A11Y-02 (P1)

Target WCAG 2.2 AA across the full workflow; this is a requirement, not an assertion of current conformance. Consult the [WCAG 2.2 standard](https://www.w3.org/TR/WCAG22/) for normative requirements and the [W3C quick reference](https://www.w3.org/WAI/WCAG22/quickref/) for criteria and implementation guidance.

- Provide skip-to-editor navigation, one page heading, landmarks, section headings, fieldsets, and associated labels/descriptions. Hide decorative icons from assistive technology.
- Support keyboard operation, visible focus, logical focus order, no traps, and no focus obscured by sticky UI. Restore focus to the trigger when Help is closed if a popover is used.
- Meet 4.5:1 contrast for normal text, 3:1 for large text and essential UI indicators. State changes use text or shape as well as color. Test actual default, hover, focus, error, and selected pairings.
- Use 44 × 44 CSS px as the product target for interactive hit areas, exceeding WCAG's 24 px AA minimum where applicable. Provide alternatives to drag interactions.
- Support 320 CSS px reflow, browser zoom at 400% on a 1280 px viewport, 200% text resizing, and adjusted text spacing. Check Windows forced-colors/high-contrast mode.
- Use native slider semantics and meaningful value text, such as “4 bits per channel, 16 levels per channel.” Provide numeric entry as an alternative.
- Keep validation errors adjacent to their controls, associate them with `aria-describedby`, and set invalid state when appropriate. Do not erase the user's file or good preview because of an unrelated error.
- Required: keyboard workflow, manually checked labels/status/focus, and axe checks. Recommended: NVDA with Firefox or Chrome on Windows and VoiceOver with Safari on iOS or macOS. Track unperformed studies explicitly; passing automated checks does not establish WCAG conformance.

## Copy and recovery

| Condition | Required message/action |
| --- | --- |
| Unsupported type | “Choose a PNG, JPEG, WebP, GIF, AVIF, or BMP image supported by your browser.” / Choose image |
| First/default frame normalization | Persistent import help: “Animated images become a still image (first/default frame).” No animation-rejection parser required |
| Too many files | “Choose one image at a time.” / Choose image |
| File over byte limit | “This file is larger than 20 MiB. Choose a smaller file.” |
| Dimensions over limit | “This image exceeds 16 megapixels or 8,192 px on one side. Resize it and try again.” |
| Decode failure | “This image couldn’t be opened in this browser. Try a PNG or JPEG version.” |
| Processing failure | “This preview couldn’t be rendered. Try again or choose a smaller output width.” / Retry |
| Worker unavailable | “Image processing isn’t available in this browser. Try another supported browser.” / Choose image remains available |

Keep the editor usable after each recoverable error. Do not show raw exception messages, technical stack traces, or memory estimates in the main user flow.
