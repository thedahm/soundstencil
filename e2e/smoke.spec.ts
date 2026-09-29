import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const bark = new URL('../test/fixtures/bark.wav', import.meta.url).pathname;

test('load a Source, drag a Selection, export a Stencil SVG', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('footer')).toContainText('never leaves your device');

  await page.locator('#file').setInputFiles(bark);
  const waveform = page.locator('#waveform');
  await expect(waveform).toBeVisible();

  // Drag across the bark, from a quarter of the way in to past its tail.
  const box = (await waveform.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.85, y, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#selection')).toBeVisible();

  const button = page.getByRole('button', { name: 'Download Stencil SVG' });
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);

  expect(download.suggestedFilename()).toMatch(/^soundstencil-line-\d+x\d+mm\.svg$/);
  const svg = await readFile(await download.path(), 'utf8');
  expect(svg).toMatch(/^<svg [^>]*width="[\d.]+mm" height="[\d.]+mm"/);
  expect(svg.match(/<path /g)).toHaveLength(1);
  expect(svg).toContain('fill="#000"');
  expect(svg).not.toContain('stroke');
});
