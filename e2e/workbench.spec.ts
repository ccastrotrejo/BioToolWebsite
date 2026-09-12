import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const example = fileURLToPath(new URL('../public/examples/1crn.cif', import.meta.url));
const multiChainPdb = ['HEADER    SYNTHETIC TWO-CHAIN TEST', ...Array.from({ length: 6 }, (_, index) => {
  const chain = index < 3 ? 'A' : 'B';
  const position = index % 3 + 1;
  return `ATOM  ${String(index + 1).padStart(5)}  CA  ALA ${chain}${String(position).padStart(4)}    ${((index % 3) * 3.8).toFixed(3).padStart(8)}${(index < 3 ? 0 : 8).toFixed(3).padStart(8)}${(0).toFixed(3).padStart(8)}  1.00 20.00           C  `;
}), 'END'].join('\n');

async function openExample(page: Page, viewer = true) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('46');
  await expect(page.locator('#library-panel')).toHaveAttribute('data-framework', 'vue');
  if (viewer) await expect(page.locator('.viewer-stage')).toHaveAttribute('data-viewer-ready', 'true', { timeout: 45_000 });
}

test('real molecular canvas, linked selections, representations and keyboard controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openExample(page);
  const canvas = page.locator('.molecular-canvas canvas').first();
  await expect(canvas).toBeVisible();
  const initialImage = await canvas.screenshot();
  await page.getByRole('button', { name: 'Rotate left', exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(initialImage)).toBe(false);
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('The molecular canvas has no visible bounds.');
  for (const [x, y] of [[0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.5, 0.4], [0.5, 0.6], [0.4, 0.4], [0.6, 0.6]]) {
    await page.mouse.click(bounds.x + bounds.width * x!, bounds.y + bounds.height * y!);
    if (await page.locator('.sequence-residue[aria-pressed="true"]').count()) break;
  }
  await expect(page.locator('.sequence-residue[aria-pressed="true"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const firstResidue = page.locator('.sequence-residue').first();
  await firstResidue.scrollIntoViewIfNeeded();
  const positionBeforeHover = await firstResidue.boundingBox();
  await firstResidue.hover();
  await expect(page.locator('.selection-inspector')).toContainText('THR 1');
  expect((await firstResidue.boundingBox())?.y).toBe(positionBeforeHover?.y);
  await firstResidue.click();
  await expect(page.locator('.selection-inspector')).toContainText('THR 1');
  await expect(page.locator('.sequence-residue[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Focus selection', exact: true }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: /^Cysteine:/i }).click();
  await expect(page.locator('.sequence-residue[aria-pressed="true"]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Triplets', exact: true }).click();
  await page.locator('.triplet-row').first().click();
  await expect(page.locator('.sequence-residue[aria-pressed="true"]')).toHaveCount(3);
  await expect(page.locator('.score-grid')).toBeVisible();
  await page.getByLabel('Color by').selectOption('propensity');
  await expect(page.getByText(/Color shows the legacy triplet heuristic/)).toBeVisible();
  let previousImage = await canvas.screenshot();
  for (const name of ['Atoms', 'Surface', 'Points', 'Ribbon']) {
    const control = page.getByRole('button', { name, exact: true });
    await control.click();
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await canvas.screenshot()).equals(previousImage)).toBe(false);
    previousImage = await canvas.screenshot();
  }
  await page.getByLabel('Show ligands').check();
  await page.getByRole('button', { name: 'Rotate left', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(page.locator('.stat').first()).toContainText('46');
  await expect(page.locator('.viewer-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('validates search, cancels downloads and preserves a valid view after failed refresh', async ({ page }) => {
  await openExample(page);
  await page.getByRole('button', { name: 'Find a structure', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('data-framework', 'vue');
  await dialog.getByLabel('PDB identifier or example name').fill('../oops');
  await dialog.getByRole('button', { name: 'Open structure', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Enter a PDB ID');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.route('https://files.rcsb.org/download/1CRN.cif', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByText('Source & analysis notes', { exact: true }).click();
  await page.getByRole('button', { name: 'Refresh from RCSB', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP 503');
  await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('46');
  let requested = false;
  await page.route('https://files.rcsb.org/download/1UBQ.cif', async (route) => {
    requested = true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.abort();
  });
  await page.getByRole('button', { name: /1UBQ Ubiquitin/ }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.load-status')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
});

test('imports PDB and mmCIF locally, keeps scope separate and never uploads', async ({ page }) => {
  await openExample(page);
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('http') && new URL(request.url()).hostname !== '127.0.0.1') remoteRequests.push(request.url());
  });
  const input = page.getByLabel('Open local structure file');
  await input.setInputFiles({ name: 'two-chains.pdb', mimeType: 'text/plain', buffer: Buffer.from(multiChainPdb) });
  await expect(page.getByRole('heading', { name: 'two-chains.pdb', exact: true })).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('6');
  await page.getByLabel('Analysis scope').selectOption({ label: 'Chain B' });
  await expect(page.locator('.stat').first()).toContainText('3');
  await expect(page.getByRole('group', { name: 'Observed sequence for chain B' })).toBeVisible();
  await page.locator('.export-menu summary').click();
  await expect(page.getByRole('button', { name: 'Copy structure link' })).toBeDisabled();
  await input.setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not coordinates') });
  await expect(page.getByRole('alert')).toContainText('Choose a .pdb');
  await expect(page.getByRole('heading', { name: 'two-chains.pdb', exact: true })).toBeVisible();
  await input.setInputFiles(example);
  await expect(page.getByRole('heading', { name: '1crn.cif', exact: true })).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('46');
  await expect(page.locator('.viewer-stage')).toHaveAttribute('data-viewer-ready', 'true', { timeout: 45_000 });
  expect(remoteRequests).toEqual([]);
});

test('production shell, Vue library, worker and molecular viewer reload entirely offline', async ({ page, context }) => {
  await openExample(page);
  await expect(page.getByText('Ready for offline use', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
  await expect(page.locator('.viewer-stage')).toHaveAttribute('data-viewer-ready', 'true', { timeout: 45_000 });
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('46');
  await expect(page.locator('#library-panel')).toHaveAttribute('data-framework', 'vue');
  await page.getByRole('button', { name: 'Find a structure', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('data-framework', 'vue');
  await page.getByRole('dialog').getByLabel('PDB identifier or example name').fill('crambin');
  await page.getByRole('dialog').getByRole('button', { name: 'Open structure', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
});

test('Vue commands update the device library without resetting search or duplicating downloads', async ({ page }) => {
  await openExample(page);
  const downloads: string[] = [];
  page.on('request', (request) => { if (request.url().includes('files.rcsb.org')) downloads.push(request.url()); });
  const library = page.locator('#library-panel[data-framework="vue"]');
  await library.evaluate((element) => element.setAttribute('data-instance-check', 'original'));
  const fileChooser = page.waitForEvent('filechooser');
  await library.getByRole('button', { name: 'Open a local file', exact: true }).click();
  await (await fileChooser).setFiles({ name: 'vue-import.pdb', mimeType: 'text/plain', buffer: Buffer.from(multiChainPdb) });
  await expect(page.getByRole('heading', { name: 'vue-import.pdb', exact: true })).toBeVisible();
  await expect(library.getByText('2 saved', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: /1CRN Crambin/ }).click();
  await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
  await library.getByRole('button', { name: /vue-import.pdb 6 observed residues/ }).click();
  await expect(page.getByRole('heading', { name: 'vue-import.pdb', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Find a structure', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const query = dialog.getByLabel('PDB identifier or example name');
  await query.fill('cramb');
  // A real host-owned source update arrives while Vue has transient input state.
  await page.getByLabel('Open local structure file').setInputFiles(example);
  await expect(page.locator('.structure-title h1')).toHaveText('1crn.cif');
  await expect(query).toHaveValue('cramb');
  await expect(query).toBeFocused();
  await expect(library).toHaveAttribute('data-instance-check', 'original');
  await page.keyboard.press('Escape');
  await library.getByRole('button', { name: 'Remove vue-import.pdb from device library', exact: true }).click();
  await expect(library.getByRole('button', { name: /vue-import.pdb 6 observed residues/ })).toHaveCount(0);
  page.once('dialog', (confirmation) => confirmation.dismiss());
  await library.getByRole('button', { name: 'Clear saved files', exact: true }).click();
  await expect(library.getByText('2 saved', { exact: true })).toBeVisible();
  page.once('dialog', (confirmation) => confirmation.accept());
  await library.getByRole('button', { name: 'Clear saved files', exact: true }).click();
  await expect(library.getByText('0 saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1crn.cif', exact: true })).toBeVisible();
  await expect(page.locator('.molecular-canvas > canvas')).toHaveCount(1);
  expect(downloads).toEqual([]);
});

test('a failed Vue chunk leaves the molecule and explicit React recovery controls usable', async ({ browser, baseURL }) => {
  const manifest: Record<string, { file: string; isDynamicEntry?: boolean }> =
    JSON.parse(await readFile(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8'));
  const entry = Object.entries(manifest).find(([key, value]) => key.includes('structure-library') && value.isDynamicEntry)?.[1];
  expect(entry, 'Vue must remain a separately lazy-loaded entry').toBeDefined();
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await page.route(`**/${entry!.file}`, (route) => route.abort());
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
    await expect(page.locator('.viewer-stage')).toHaveAttribute('data-viewer-ready', 'true', { timeout: 45_000 });
    await expect(page.locator('#library-panel')).toHaveAttribute('data-framework', 'react-recovery');
    await expect(page.getByRole('alert')).toContainText('Library recovery mode');
    await page.locator('.sequence-residue').first().click();
    await expect(page.locator('.selection-inspector')).toContainText('THR 1');
    await page.getByRole('button', { name: 'Retry Vue library', exact: true }).click();
    await expect(page.locator('#library-panel')).toHaveAttribute('data-framework', 'react-recovery');
    await page.getByRole('button', { name: 'Find a structure', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('data-framework', 'react-recovery');
    await expect(dialog.getByRole('alert')).toContainText('Library recovery mode');
    await dialog.getByLabel('PDB identifier or example name').fill('1CRN');
    await dialog.getByRole('button', { name: 'Open structure', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open a local file', exact: true }).click();
    await (await chooser).setFiles({ name: 'recovery.pdb', mimeType: 'text/plain', buffer: Buffer.from(multiChainPdb) });
    await expect(page.getByRole('heading', { name: 'recovery.pdb', exact: true })).toBeVisible();
    await expect(page.locator('.stat').first()).toContainText('6');
    await page.unroute(`**/${entry!.file}`);
    await page.reload();
    await expect(page.locator('#library-panel')).toHaveAttribute('data-framework', 'vue');
    await expect(page.locator('.library-recovery')).toHaveCount(0);
  } finally { await context.close(); }
});

test('a corrupt saved source fails explicitly and can recover from the empty workspace', async ({ page }) => {
  await openExample(page);
  await expect(page.getByText('1 saved', { exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('biotool-library-v1', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('structures', 'readwrite');
      const store = transaction.objectStore('structures');
      const read = store.get('1CRN');
      read.onsuccess = () => store.put({ ...read.result, source: { ...read.result.source, data: 'corrupt coordinates' } });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onabort = () => { database.close(); reject(transaction.error); };
    };
  }));
  await page.reload();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with a structure.', exact: true })).toBeVisible();
  const data = await readFile(example, 'utf8');
  await page.route('https://files.rcsb.org/download/1CRN.cif', (route) => route.fulfill({ body: data, contentType: 'text/plain' }));
  await page.getByRole('button', { name: 'Refresh 1CRN from RCSB' }).click();
  await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('46');
});

test('downloads original coordinates, FASTA, PNG and an independently interactive offline report', async ({ page, context }, testInfo) => {
  await openExample(page);
  await page.locator('.export-menu summary').click();
  for (const name of ['Original coordinates', 'Observed FASTA', 'Triplet HTML']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const file = await download;
    expect(await file.failure()).toBeNull();
    await file.saveAs(join(testInfo.outputDir, file.suggestedFilename()));
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Overview HTML', exact: true }).click();
  const report = await download;
  const reportPath = join(testInfo.outputDir, report.suggestedFilename());
  await report.saveAs(reportPath);
  await page.locator('.export-menu summary').click();
  const imageDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download molecular image', exact: true }).click();
  const image = await imageDownload;
  expect(image.suggestedFilename()).toMatch(/\.png$/);
  await image.saveAs(join(testInfo.outputDir, image.suggestedFilename()));
  const html = await readFile(reportPath, 'utf8');
  expect(html).not.toMatch(/<script[^>]+src=/);
  await context.setOffline(true);
  const reportPage = await context.newPage();
  const errors: string[] = [];
  reportPage.on('pageerror', (error) => errors.push(error.message));
  await reportPage.setContent(html);
  await expect(reportPage.locator('canvas')).toBeVisible();
  await expect(reportPage.locator('table').first()).toBeVisible();
  const rotate = reportPage.getByRole('button', { name: /rotate/i }).first();
  await expect(rotate).toBeVisible();
  await rotate.click();
  expect(errors).toEqual([]);
});

test('remains usable across narrow screens, light mode and reduced motion', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openExample(page);
  for (const width of [320, 375, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('heading', { name: 'Crambin', exact: true })).toBeVisible();
    const sizes = await page.evaluate(() => ({
      viewport: innerWidth, document: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll('button, select, .molecular-panel, .analysis-panel'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
        }).map((element) => element.textContent?.slice(0, 60)),
    }));
    expect(sizes.document, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.viewport);
    expect(sizes.overflowing, `${width}px`).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`workbench-${width}-dark.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: testInfo.outputPath('workbench-1440-light.png'), fullPage: true });
});

test('keeps sequence and analysis available when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
        if (String(args[0]).includes('webgl')) return null;
        return original.apply(this, args);
      },
    });
  });
  await openExample(page, false);
  await expect(page.getByRole('alert')).toContainText('Sequence and analysis remain available');
  await page.locator('.sequence-residue').first().click();
  await expect(page.locator('.selection-inspector')).toContainText('THR 1');
  await expect(page.getByRole('button', { name: 'Focus selection', exact: true })).toBeDisabled();
  await expect(page.locator('.stat').first()).toContainText('46');
});

test('provides accessible light/dark controls and a keyboard-contained search dialog', async ({ page }) => {
  await openExample(page);
  for (const appearance of ['dark', 'light']) {
    if (appearance === 'light') await page.getByRole('button', { name: 'Switch to light mode' }).click();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
  }
  const trigger = page.getByRole('button', { name: 'Find a structure', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('PDB identifier or example name')).toBeFocused();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('uses quiet theme-aware scrollbars without losing keyboard scrolling', async ({ page }) => {
  await openExample(page);
  const details = page.getByRole('region', { name: 'Composition details', exact: true });
  await page.getByRole('button', { name: 'Show all 20 amino acids' }).click();
  const darkColor = await details.evaluate((element) => getComputedStyle(element).scrollbarColor);
  await expect(details).toHaveCSS('scrollbar-width', 'thin');
  await details.focus();
  await page.keyboard.press('End');
  await expect.poll(() => details.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Home');
  await expect.poll(() => details.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  const lightColor = await details.evaluate((element) => getComputedStyle(element).scrollbarColor);
  expect(lightColor).not.toBe(darkColor);
});

test('keeps compact controls comfortably clickable and icon transitions interruptible', async ({ page }) => {
  await openExample(page);
  const smallTargets = await page.locator('button, select, summary, a').evaluateAll((elements) => elements.flatMap((element) => {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height || element.matches(':disabled')) return [];
    return bounds.width < 40 || bounds.height < 40
      ? [{ label: element.getAttribute('aria-label') ?? element.textContent?.trim(), width: bounds.width, height: bounds.height }] : [];
  }));
  expect(smallTargets).toEqual([]);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('.theme-glyph')).toHaveCount(2);
  await expect(page.locator('.theme-glyph[data-active="true"]')).toHaveCSS('opacity', '1');
  await expect(page.locator('.theme-glyph[data-active="false"]')).toHaveCSS('opacity', '0');
  await page.locator('.export-menu summary').click();
  await page.getByRole('button', { name: 'Observed FASTA', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.export-menu')).not.toHaveAttribute('open');
  await expect(page.locator('.export-menu summary')).toBeFocused();
});

test('shows the dotted workspace through the molecular canvas background', async ({ page }) => {
  await openExample(page);
  const screenshot = await page.locator('.viewer-stage').screenshot();
  const colors = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const sample = document.createElement('canvas');
    sample.width = 24;
    sample.height = 24;
    const context = sample.getContext('2d');
    if (!context) throw new Error('Cannot inspect the canvas screenshot.');
    context.drawImage(image, 16, 96, 24, 24, 0, 0, 24, 24);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    const values = new Set<string>();
    for (let index = 0; index < pixels.length; index += 4) values.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    return values.size;
  }, screenshot.toString('base64'));
  expect(colors).toBeGreaterThan(1);
});
