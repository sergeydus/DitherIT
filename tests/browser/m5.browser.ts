import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installWorkerProbe, type ProbeWindow } from '../helpers/worker-probe';

test('AC-13/20: first sample frame hides zero-percent zoom until a preview exists', async ({ page }, testInfo) => {
  await installWorkerProbe(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Try a sample' })).toBeEnabled();
  await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.holdRender = true; });
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as ProbeWindow).__probe.held.complete ?? 0)).toBe(1);
  await expect(page.getByText('No preview rendered yet.', { exact: true })).toBeVisible();
  await expect(page.locator('#zoom-readout')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Zoom controls', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Pan controls', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('first-frame.png'), fullPage: true });
  await page.evaluate(() => { (window as unknown as ProbeWindow).__probe.release('complete'); });
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
  await expect(page.getByText('No preview rendered yet.', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Zoom level', { exact: true })).toBeEnabled();
  await expect(page.locator('#zoom-readout')).toContainText('Fit · ');
  await expect(page.locator('#zoom-readout')).not.toContainText('· 0%');
});

test('AC-22: landscape mobile and 400% equivalent reflow keep exploration and export usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Try a sample' })).toBeEnabled();
  await page.getByRole('button', { name: 'Try a sample' }).click();
  await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeEnabled();
  for (const width of [844, 320]) {
    // 1280 CSS px at 400% browser zoom has a 320 CSS px layout viewport.
    await page.setViewportSize({ width, height: 390 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('radio', { name: 'Split', exact: true }).check();
    await page.getByRole('checkbox', { name: '1:1 detail', exact: true }).check();
    await page.getByRole('button', { name: 'Export PNG', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Export PNG', exact: true })).toBeInViewport();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`ready-${width}x390.png`), fullPage: true });
  }
});
