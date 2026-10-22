# M5 — Release validation

M5 implements QA-01 and ARCH-02. The [requirements register](04-delivery-and-acceptance.md#requirements-and-evidence) links M0–M4 tests/notes and M5's workflows and user documentation. Local verification does not assert that a hosted Actions run or Pages deployment has happened.

## Changes

- Before the first committed frame, [ImagePreview](../../src/components/ImagePreview.tsx) shows “No preview rendered yet.” and hides comparison, zoom/pan and detail controls. The existing status line still describes opening, rendering, cancellation or failure. The viewport stays mounted so its ResizeObserver measures the real area before the first frame; retained committed frames keep their controls while a replacement render runs.
- The inspector is a labelled section rather than a nested complementary `aside` landmark. The new unrestricted axe checks identified this best-practice advisory; settings are primary editor content, and the semantic change leaves layout and controller behavior intact.
- [Deployment CI](../../.github/workflows/deploy.yml) retains `master` push and manual dispatch. Ordered gates are `npm ci`, lint, `tsc --noEmit`, Node tests, production build, Playwright Chromium installation with system dependencies, then browser tests against `out` at `/DitherIT/`. Pages artifact upload follows successful tests; deployment depends on the successful build job.
- [PR CI](../../.github/workflows/pull-request.yml) runs the same commands with read-only repository permissions and no deploy job. Superseded PR validation cancels; Pages runs retain their existing serial concurrency policy.
- CI emits a Playwright HTML report, screenshots and retained failure traces. Both workflows upload `playwright-report/` and `test-results/` on failure, retaining them for 14 days. Missing browser artifacts after an earlier check failure are harmless. Manual benchmarks stay outside CI.
- ESLint excludes generated Playwright reports/results, so lint remains repeatable after a failed browser run has written third-party report scripts.
- The [README](../../README.md) documents shipped behavior, formats/limits, Standard sizing, privacy, setup/checks, static serving and deployment. [Release notes](09-release-notes.md) describe algorithm and format behavior changes and known limitations.

## Implementation history

| Work | Local commit | Evidence |
| --- | --- | --- |
| Independent master trigger correction | `06b1b84` | [Push filter](../../.github/workflows/deploy.yml) |
| Specifications | `f50b0d7` | [Specification index](README.md) |
| M0 rendering | `045f5c8` | [Core and fixture tests](../../src/utils/dithering.test.ts), [golden fixture](../../src/utils/fixtures/gradient-8x8.v1.json) |
| M1 lifecycle/import/export | `354cb7b` | [M1 notes](05-m1-implementation.md), [browser smoke](../../tests/browser/m1.browser.ts) |
| M2 settings/output | `ef46a0c` | [M2 notes](06-m2-implementation.md), [keyboard/validation/export tests](../../tests/browser/m2.browser.ts) |
| M3 workspace/theme | `94a8321` | [M3 notes](07-m3-implementation.md), [screenshots/axe/reflow tests](../../tests/browser/m3.browser.ts) |
| M4 exploration | `f811d12` | [M4 notes](08-m4-implementation.md), [exploration tests](../../tests/browser/m4.browser.ts) |
| M5 release validation | Commit containing this document | [First-frame/landscape/reflow tests](../../tests/browser/m5.browser.ts), workflows and documentation above |

## Local verification

The original M5 environment was Windows x64, Node 24.21.0, with a local Chromium executable selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The browser suite serves the production export, not the dev server. A separately launched static helper was reused with `PLAYWRIGHT_REUSE_STATIC_SERVER=1` to avoid restricted Windows child-process teardown; CI uses Playwright's managed server. Setting `CI=true` locally exercises the HTML reporter configuration too.

| Check | Result |
| --- | --- |
| `npm ci` using a writable temporary npm cache | Pass, installed from the existing lockfile without dependency changes |
| `npm run lint` | Pass, including after HTML reports exist |
| `npx tsc --noEmit` | Pass |
| `npm test` | Pass, 129 tests across six files |
| `npm run build` | Pass, static `out` generated |
| `npm run test:browser` with CI reporter enabled | Pass, all 46 tests (44 M1–M4 plus two M5), including axe and exact committed-buffer PNG checks |
| Workflow YAML parsing and assertions | Pass: master/manual events, PR read-only permissions/no deploy, identical ordered commands, failure artifacts and Pages dependency |
| Local Markdown links | Pass, README and every modernization document resolve local targets |
| `npm run bench` | Pass; manual Node measurements below, not a CI or device-performance gate |

The first browser pass demonstrated that a failure writes the HTML report, screenshot and trace. It also identified the inspector landmark advisory described above. A subsequent rerun caught an ambiguous selector in the new landscape test after the detail region appeared; the test now selects the checkbox by role and accessible name. No axe rule exclusions were added.

### Node 22 pre-release verification

The pre-release rerun used Windows x64, **Node 22.14.0 / npm 11.2.0**, `@axe-core/playwright` **4.14.0**, and the locked Playwright Chromium **156.0.8078.4 (build 1248)**. `npm install` refreshed the lockfile, then a clean `npm ci`, lint, `tsc --noEmit`, 129 Node tests, production build and all 46 browser tests passed. Browser tests took **1.5 minutes** with `CI=true` and the normal Playwright-managed static server; neither an executable override nor server reuse was needed. Both workflows select Node 22, `.nvmrc` contains 22, and package engines declare `>=22.12`. YAML/manifest assertions verified those versions and the unchanged gate order.

The complete suite regenerates the 40 responsive state/theme screenshots in `test-results/m3-screenshots/` (with `index.html`) and four exploration screenshots in `test-results/m4-screenshots/`. M5's per-test directories also contain `first-frame.png`, `ready-844x390.png` and `ready-320x390.png`. These generated artifacts are ignored by Git and included in CI failure uploads. The M5 browser tests hold the real worker's first reply to prove no zero-percent zoom is presented, then release it and verify controls appear. Landscape mobile and 320 CSS px reflow retain exploration/export access; existing tests cover 200% text and spacing overrides.

The first-frame desktop capture and 320 × 390 ready/exploration capture were visually inspected: no fabricated zoom value before rendering, controls remain readable and wrap within the narrow page. The reflow screenshot retains keyboard focus left by the accessibility scan.

### Manual benchmark

`npm run bench`: AMD Ryzen 7 5800X3D, 1000 × 1000 px RGB gradient/texture with alpha 0/128/255, 3 bits/channel, seed 42, two warmups and median of five. Includes output allocation and optional soften, excludes decoding/PNG encoding. Measurements are local observations, not p95 or mobile targets.

| Method | Soften off (ms) | Soften on (ms) |
| --- | --- | --- |
| Original | 0.48 | 0.44 (bypassed) |
| Threshold | 30.39 | 142.83 |
| Floyd–Steinberg | 43.32 | 180.75 |
| Atkinson | 46.41 | 183.25 |
| Ordered | 32.03 | 162.54 |
| Random | 73.61 | 225.78 |

### Semantic contrast review

Ratios calculated from the actual [CSS tokens](../../src/app/globals.css), using linearized sRGB relative luminance. Each surface row is the minimum against background, surface and surface-muted, covering default/hover controls and selected/error/focus indicators. Empty-preview copy is also checked against both checkerboard colors. Disabled controls are excluded from contrast requirements; image pixels are not UI text surfaces. Full-page axe runs inspect the rendered states in both themes.

| Pair | Light minimum | Dark minimum | Target |
| --- | --- | --- | --- |
| Text / surfaces | 14.95:1 | 13.98:1 | 4.5:1 |
| Muted text / surfaces | 6.24:1 | 7.93:1 | 4.5:1 |
| Empty-preview copy / checkerboard | 5.70:1 | 6.35:1 | 4.5:1 |
| Accent links, selected controls and focus / surfaces | 7.70:1 | 8.31:1 | 4.5:1 text; 3:1 indicators |
| Danger text/border / surfaces | 6.87:1 | 8.12:1 | 4.5:1 text; 3:1 indicators |
| Essential border / surfaces | 3.80:1 | 3.28:1 | 3:1 |
| Primary button text / accent | 8.98:1 | 9.25:1 | 4.5:1 |

## Interpretation choices and open evidence

1. First-frame controls are absent until there is a committed image; a truthful empty-preview message also works after cancellation/failure. There is still only one polite status region. Previously committed frames remain inspectable while an update runs.
2. Browser checks must run **after** the production build, so both workflows build before installing/running Playwright. Pages upload and deploy remain after all checks. PRs never publish.
3. Pre-release tooling targets Node 22 in both workflows and `.nvmrc`, with a package engine minimum of 22.12 and `@axe-core/playwright` updated to the current 4.x line. The original M5 local checks used Node 24. Benchmark results are Node medians, not the spec's recommended browser/device p95 study.
4. The 320 CSS px viewport is the layout equivalent of a 1280 px viewport at 400% browser zoom. Automated viewport/text checks do not claim browser chrome zoom or native assistive-technology validation.
5. **Open — first hosted Actions/Pages verification:** awaiting the authorized pre-release push-triggered run and live smoke check. Verify that run, its failure-artifact behavior if a check fails, the Pages environment and hosted refresh/assets after deployment; attach the run URL to QA-01 when available. Local YAML/event/order inspection and static-path browser tests cover the local release gate, without claiming this operational evidence.
6. **Not performed — recommended studies:** NVDA/VoiceOver, formative usability, multi-device p95/heap profiling, full browser/touch matrix and reviewed before/after photo/art gallery. Automated Chromium/axe and synthetic Node timing do not establish WCAG conformance, broad compatibility or mobile performance.
