/// <reference types="node" />
// The chart plotter for coastal-navigation lessons (tools/chart-plotter/chart-plotter.html):
// one offline HTML file, so it is opened straight from disk, like a teacher would.
// Checks the navigation maths, the main lesson journeys, saving, layout and accessibility.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from './support';

const URL = pathToFileURL(path.resolve('tools/chart-plotter/chart-plotter.html')).href;
const OUT = 'e2e-results/chart-plotter';

// The practice chart's coastline (minutes of longitude east of 34°E, by minutes of latitude north of 32°N)
const coast = (m: number) => 54 + 1.2 * Math.sin(m / 3.1) - 3.6 * Math.exp(-(((m - 12) / 1.6) ** 2)) + 1.6 * Math.exp(-(((m - 5) / 1.1) ** 2));

type Pt = { x: number; y: number };
declare global {
  interface Window {
    navplot: {
      S: { objects: { type: string; layer: string; label?: string; kind?: string }[]; ruler: { on: boolean; brg: number }; calib: unknown; task: string };
      rhumb: (a: Pt, b: Pt) => { brg: number; nm: number | null };
      fromGeo: (lat: number, lon: number) => Pt;
      toGeo: (p: Pt) => { lat: number; lon: number } | null;
      toS: (p: Pt) => Pt;
      toW: (p: Pt) => Pt;
      solveCTS: (o: { track: number; dist: number; spd: number; set: number; rate: number; lee?: number; wind?: string }) => { wt: number; hdg: number; sog: number; hours: number; error?: string };
    };
  }
}

async function open(page: Page) {
  // Saving goes to the Downloads folder instead of the system "save as" window
  await page.addInitScript(() => { delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker; });
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'שולחן ניווט' })).toBeVisible();
}
async function openSample(page: Page) {
  await open(page);
  await page.locator('#eSample').click();
  await expect(page.locator('#stCal')).toContainText('מכויל');
}
/** Screen position (page coordinates) of a latitude / longitude given in minutes past 32°N / 34°E. */
async function at(page: Page, latMin: number, lonMin: number) {
  const box = (await page.locator('#cv').boundingBox())!;
  const s = await page.evaluate(([a, o]) => window.navplot.toS(window.navplot.fromGeo(32 + a / 60, 34 + o / 60)), [latMin, lonMin]);
  return { x: box.x + s.x, y: box.y + s.y };
}
async function tap(page: Page, p: Pt) {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}
async function dragLine(page: Page, a: Pt, b: Pt) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
/** Confirms the open window and lets the tool finish what the window asked for. */
async function ok(page: Page) {
  await page.locator('dialog[open] button[value=ok]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 30)));
}

test.describe('maths', () => {
  test('rhumb lines, distances and course to steer', async ({ page }) => {
    await openSample(page);
    const r = await page.evaluate(() => {
      const n = window.navplot;
      const a = n.fromGeo(32, 34 + 40 / 60);
      return {
        north: n.rhumb(a, n.fromGeo(32 + 10 / 60, 34 + 40 / 60)),
        east: n.rhumb(a, n.fromGeo(32, 34 + 50 / 60)),
        back: n.toGeo(a),
        // Track 090°, 5 kn through the water, current 000° 1 kn: steer 11.5° into it, SOG √24
        cts: n.solveCTS({ track: 90, dist: 10, spd: 5, set: 0, rate: 1 }),
        tooStrong: n.solveCTS({ track: 90, dist: 10, spd: 1, set: 0, rate: 2 }),
        leeway: n.solveCTS({ track: 0, dist: 5, spd: 5, set: 0, rate: 0, lee: 5, wind: 'stbd' }),
      };
    });
    expect(r.north.nm).toBeCloseTo(10, 6);          // one minute of latitude is one nautical mile
    expect(r.north.brg).toBeCloseTo(0, 6);
    expect(r.east.brg).toBeCloseTo(90, 6);
    expect(r.east.nm!).toBeCloseTo(10 * Math.cos(32 * Math.PI / 180), 2);
    expect(r.back!.lat).toBeCloseTo(32, 9);
    expect(r.back!.lon).toBeCloseTo(34 + 40 / 60, 9);
    expect(r.cts.wt).toBeCloseTo(90 + Math.asin(0.2) * 180 / Math.PI, 6);
    expect(r.cts.sog).toBeCloseTo(Math.sqrt(24), 6);
    expect(r.tooStrong.error).toBeTruthy();
    expect(r.leeway.hdg).toBeCloseTo(5, 6);        // wind from starboard pushes to port: steer up into it
  });
});

test.describe('lesson journeys', () => {
  test('three bearings, a fix and the course to steer into the harbour', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: /כיוון לנ״צ/ }).click();
    const landmarks: [number, number, string][] = [[12, coast(12) + 0.3, '059'], [7.4, coast(7.4) + 1.4, '100'], [16.5, coast(16.5) + 1.5, '046']];
    for (const [m, lon, brg] of landmarks) {
      await tap(page, await at(page, m, lon));
      await page.locator('#f_brg').fill(brg);
      await page.locator('#f_time').fill('10:00');
      await ok(page);
    }
    expect(await page.evaluate(() => window.navplot.S.objects.filter((o) => o.type === 'line').length)).toBe(3);
    await page.screenshot({ path: `${OUT}/bearings.png` });

    // The fix snaps to where the bearing lines cross: 32°10'N 034°45'E
    await page.getByRole('button', { name: /^סימון/ }).click();
    const boat = await at(page, 10, 45);
    await tap(page, { x: boat.x + 6, y: boat.y - 5 });
    await page.getByRole('button', { name: /^בחירה/ }).click();
    await tap(page, boat);
    await expect(page.locator('#selInfo')).toContainText(/32°(09\.9\d|10\.0\d)'N/);
    await expect(page.locator('#selInfo')).toContainText(/034°(44\.9\d|45\.0\d)'E/);

    // Course to steer from the fix to the harbour entrance, 5 kn, current 020° 0.8 kn
    await page.getByRole('button', { name: /משולש זרמים/ }).click();
    await tap(page, boat);
    await expect(page.locator('#hint')).toBeVisible();
    await tap(page, await at(page, 5, coast(5) - 1.15));
    await expect(page.locator('dialog[open] .intro')).toContainText('119°T');
    await ok(page);
    await expect(page.locator('#resultBox')).toContainText('123°M');
    await expect(page.locator('#resultBox')).toContainText('12:08');
    await page.screenshot({ path: `${OUT}/exercise-solved.png` });
  });

  test('a new map: open a picture, calibrate it, measure on it', async ({ page }) => {
    await open(page);
    // A Mercator picture 900px high: its corners are 32°10'N 034°40'E and 32°00'N 034°52'E
    const { png, width } = await page.evaluate(() => {
      const merc = (deg: number) => Math.log(Math.tan(Math.PI / 4 + (deg * Math.PI) / 360));
      const w = Math.round((900 * (12 / 60) * Math.PI / 180) / (merc(32 + 10 / 60) - merc(32)));
      const c = document.createElement('canvas'); c.width = w; c.height = 900;
      const g = c.getContext('2d')!; g.fillStyle = '#eaf3fb'; g.fillRect(0, 0, w, 900);
      g.strokeStyle = '#789'; for (let x = 0; x <= w; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 900); g.stroke(); }
      return { png: c.toDataURL('image/png').split(',')[1], width: w };
    });
    await page.locator('#fileOpen').setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.locator('#stCal')).toHaveText('לא מכויל');

    await page.getByRole('button', { name: 'כיול מפה' }).click();
    await ok(page);   // two points with coordinates
    const box = (await page.locator('#cv').boundingBox())!;
    const img = async (x: number, y: number) => {
      const s = await page.evaluate(([px, py]) => window.navplot.toS({ x: px, y: py }), [x, y]);
      return { x: box.x + s.x, y: box.y + s.y };
    };
    await tap(page, await img(0, 0));
    await page.locator('#f_latD').fill('32'); await page.locator('#f_latM').fill('10');
    await page.locator('#f_lonD').fill('34'); await page.locator('#f_lonM').fill('40');
    await ok(page);
    await tap(page, await img(width, 900));
    await expect(page.locator('#f_latD')).toHaveValue('32');   // second point starts from the first one
    await page.locator('#f_latM').fill('0'); await page.locator('#f_lonM').fill('52');
    await ok(page);
    await expect(page.locator('#stCal')).toContainText('מכויל');

    await page.getByRole('button', { name: /^מדידה/ }).click();
    await dragLine(page, await img(0, 0), await img(0, 900));
    await expect(page.locator('#readout')).toContainText('180°T');
    await expect(page.locator('#readout')).toContainText('10.0 NM');
  });

  test('a scanned map: type in its printed scale (1:25,000), the scan resolution comes from the file', async ({ page }) => {
    await open(page);
    // an 800×400 PNG that says it was scanned at 200 DPI (a pHYs chunk, as scanners write)
    const png = Buffer.from(await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 800; c.height = 400;
      const g = c.getContext('2d')!; g.fillStyle = '#eaf3fb'; g.fillRect(0, 0, 800, 400);
      return c.toDataURL('image/png').split(',')[1];
    }), 'base64');
    const crc = (buf: Buffer) => {
      let c = ~0;
      for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
      return (~c) >>> 0;
    };
    const ppm = Math.round(200 / 0.0254), data = Buffer.alloc(9);
    data.writeUInt32BE(ppm, 0); data.writeUInt32BE(ppm, 4); data.writeUInt8(1, 8);
    const body = Buffer.concat([Buffer.from('pHYs'), data]), chunk = Buffer.alloc(12 + 9);
    chunk.writeUInt32BE(9, 0); body.copy(chunk, 4); chunk.writeUInt32BE(crc(body), 17);
    const afterIhdr = 8 + 12 + png.readUInt32BE(8);
    await page.locator('#fileOpen').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: Buffer.concat([png.subarray(0, afterIhdr), chunk, png.subarray(afterIhdr)]) });
    await expect(page.locator('#stCal')).toHaveText('לא מכויל');

    await page.getByRole('button', { name: 'כיול מפה' }).click();
    await page.locator('#f_method').selectOption('ratio');
    await page.locator('dialog[open] button[value=ok]').click();   // the scale window opens right after
    await expect(page.locator('#f_dpi')).toHaveValue('200');
    await expect(page.locator('dialog[open] .intro')).toContainText('200 DPI');
    await page.locator('#f_ratio').fill('1:25,000');
    await ok(page);
    await expect(page.locator('#stCal')).toContainText('1:25,000');

    // 1 NM = 1852 m / 25,000 = 7.408 cm on paper = 583.3 px at 200 DPI
    const box = (await page.locator('#cv').boundingBox())!;
    const img = async (x: number, y: number) => {
      const s = await page.evaluate(([px, py]) => window.navplot.toS({ x: px, y: py }), [x, y]);
      return { x: box.x + s.x, y: box.y + s.y };
    };
    await page.getByRole('button', { name: /^מדידה/ }).click();
    await dragLine(page, await img(100, 200), await img(100 + 1852 / 25000 / 0.0254 * 200, 200));
    await expect(page.locator('#readout')).toContainText('090°T');
    await expect(page.locator('#readout')).toContainText(/(0\.99|1\.00|1\.01) NM/);
  });

  test('ruler: a line drawn along its edge follows the ruler bearing, and lines can be transferred', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: /^סרגל/ }).click();
    await page.locator('#inRulerBrg').fill('70');
    await expect(page.locator('#readout')).toContainText('070°T · 065°M');
    // a point on the ruler's upper edge, then drag roughly sideways: the line slides along the edge
    const edge = await page.evaluate(() => {
      const n = window.navplot, r = n.S.ruler as unknown as { c: Pt; brg: number }, c = n.toS(r.c);
      const t = (r.brg * Math.PI) / 180, u = { x: Math.sin(t), y: -Math.cos(t) }, nn = { x: -u.y, y: u.x };
      return { a: { x: c.x - u.x * 150 - nn.x * 43, y: c.y - u.y * 150 - nn.y * 43 }, b: { x: c.x + u.x * 120 - nn.x * 60, y: c.y + u.y * 120 - nn.y * 60 } };
    });
    const box = (await page.locator('#cv').boundingBox())!;
    await page.getByRole('button', { name: /^קו/ }).click();
    await dragLine(page, { x: box.x + edge.a.x, y: box.y + edge.a.y }, { x: box.x + edge.b.x, y: box.y + edge.b.y });
    const brg = await page.evaluate(() => {
      const l = window.navplot.S.objects.at(-1) as unknown as { a: Pt; b: Pt };
      return window.navplot.rhumb(l.a, l.b).brg;
    });
    expect(brg).toBeCloseTo(70, 0);

    // Running fix: select the line and move it 2 NM along 000°T
    await page.getByRole('button', { name: /^בחירה/ }).click();
    const mid = await page.evaluate(() => {
      const l = window.navplot.S.objects.at(-1) as unknown as { a: Pt; b: Pt };
      return window.navplot.toS({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 });
    });
    await tap(page, { x: box.x + mid.x, y: box.y + mid.y });
    await page.getByRole('button', { name: /העברת קו/ }).click();
    await page.locator('#f_hdg').fill('0'); await page.locator('#f_kind').selectOption('T');
    await page.locator('#f_spd').fill('4'); await page.locator('#f_min').fill('30');
    await ok(page);
    const moved = await page.evaluate(() => {
      const [a, b] = window.navplot.S.objects.slice(-2) as unknown as { a: Pt }[];
      return window.navplot.rhumb(a.a, b.a);
    });
    expect(moved.brg).toBeCloseTo(0, 3);
    expect(moved.nm!).toBeCloseTo(2, 3);
  });

  test('ruler: pulling an end knob stretches it, and it can be made bigger', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: /^סרגל/ }).click();
    const box = (await page.locator('#cv').boundingBox())!;
    const geom = () => page.evaluate(() => {
      const n = window.navplot, r = n.S.ruler as unknown as { c: Pt; brg: number; len: number; size: number }, c = n.toS(r.c);
      const t = (r.brg * Math.PI) / 180, u = { x: Math.sin(t), y: -Math.cos(t) }, nn = { x: -u.y, y: u.x }, k = r.size, a = r.len / 2 - 24 * k;
      return { len: r.len, size: r.size, brg: r.brg, knob: { x: c.x + u.x * a + nn.x * 8 * k, y: c.y + u.y * a + nn.y * 8 * k }, u };
    });
    const before = await geom();
    const from = { x: box.x + before.knob.x, y: box.y + before.knob.y };
    await dragLine(page, from, { x: from.x + before.u.x * 120, y: from.y + before.u.y * 120 });
    const after = await geom();
    expect(after.len).toBeGreaterThan(before.len + 200);
    expect(after.brg).toBeCloseTo(before.brg, 0);
    await expect(page.locator('#readout')).toContainText('אורך הסרגל');

    await page.locator('#inRulerSize').selectOption('1.7');
    expect((await geom()).size).toBe(1.7);
    await page.screenshot({ path: `${OUT}/ruler-big.png` });
  });

  test('dividers, dead reckoning, undo and redo', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: /^מחוגה/ }).click();
    await dragLine(page, await at(page, 10, 45), await at(page, 12, 45));
    await expect(page.locator('#readout')).toContainText('2.00 NM');
    // the default is a half circle, facing the way the drag went (north)
    const arc = await page.evaluate(() => (window.navplot.S.objects.at(-1) as unknown as { arc: [number, number] }).arc);
    expect(arc[1] - arc[0]).toBeCloseTo(Math.PI, 6);
    expect((arc[0] + arc[1]) / 2).toBeCloseTo(-Math.PI / 2, 2);

    await page.getByRole('button', { name: /ניווט מת/ }).click();
    await tap(page, await at(page, 10, 45));
    await page.locator('#f_hdg').fill('180'); await page.locator('#f_kind').selectOption('T');
    await page.locator('#f_spd').fill('6'); await page.locator('#f_min').fill('30');
    await page.locator('#f_rate').fill('0');
    await ok(page);
    await expect(page.locator('#resultBox')).toContainText('ניווט מת (DR)');
    await expect(page.locator('#resultBox')).toContainText(/32°07\.00'N/);   // 3 NM south

    const count = () => page.evaluate(() => window.navplot.S.objects.length);
    expect(await count()).toBe(3);   // half circle, water track, DR mark
    await page.getByRole('button', { name: 'ביטול פעולה' }).click();
    expect(await count()).toBe(1);
    await page.getByRole('button', { name: 'ביצוע מחדש' }).click();
    expect(await count()).toBe(3);
  });
});

test.describe('video', () => {
  test('record the map with the voice, pause, and save the video', async ({ page }, info) => {
    await openSample(page);
    await page.getByRole('button', { name: 'הקלטת וידאו' }).click();
    await expect(page.locator('#f_what')).toHaveValue('map');
    await expect(page.locator('#f_mic')).toHaveValue('yes');
    await ok(page);
    await expect(page.locator('#recBar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'הקלטת וידאו' })).toHaveAttribute('aria-pressed', 'true');

    // explain something on the map while recording
    await page.getByRole('button', { name: /^קו/ }).click();
    await dragLine(page, await at(page, 10, 40), await at(page, 12, 43));
    await expect(page.locator('#recTime')).not.toHaveText('00:00', { timeout: 4000 });
    await page.locator('#recPause').click();
    await expect(page.locator('#recPause')).toHaveText('המשך');
    await page.locator('#recPause').click();
    await page.screenshot({ path: `${OUT}/recording.png` });

    const dl = page.waitForEvent('download');
    await page.locator('#recStop').click();
    const file = info.outputPath('lesson-video');
    await (await dl).saveAs(file);
    const bytes = fs.readFileSync(file);
    expect(bytes.length).toBeGreaterThan(2000);
    const webm = bytes.readUInt32BE(0) === 0x1a45dfa3, mp4 = bytes.toString('latin1', 4, 8) === 'ftyp';
    expect(webm || mp4).toBe(true);
    expect(await page.evaluate(() => (window.navplot as unknown as { REC: { last: { hadAudio: boolean } } }).REC.last.hadAudio)).toBe(true);
    await expect(page.locator('#recBar')).toBeHidden();
  });
});

test.describe('exercises', () => {
  test('save, reopen, export for students and compare with the solution', async ({ page }, info) => {
    await openSample(page);
    // a question line, and a fix in the solution layer
    await page.getByRole('button', { name: /^קו/ }).click();
    await dragLine(page, await at(page, 10, 40), await at(page, 12, 42));
    await page.locator('details#exBox summary').click();
    await page.locator('input[name=layer][value=solution]').check();
    await page.getByRole('button', { name: /^סימון/ }).click();
    await tap(page, await at(page, 10, 45));

    // (a page opened from disk can't name its downloads, so the test names them)
    const save = async (button: RegExp | string, name: string) => {
      const dl = page.waitForEvent('download');
      await page.getByRole('button', { name: button }).click();
      const file = info.outputPath(name);
      await (await dl).saveAs(file);
      return file;
    };
    const teacher = await save(/^שמירה$/, 'teacher.json');
    const student = await save('ייצוא לתלמידים', 'student.json');
    const studentData = JSON.parse(fs.readFileSync(student, 'utf8'));
    expect(studentData.forStudent).toBe(true);
    expect(studentData.objects.map((o: { layer: string }) => o.layer)).toEqual(['base']);

    // The student opens the exercise: answers go into the student layer
    await page.locator("#fileOpen").setInputFiles(student);
    await expect(page.locator('#stLayer')).toContainText('תשובת תלמיד');
    expect(await page.evaluate(() => window.navplot.S.objects.length)).toBe(1);
    await page.getByRole('button', { name: /^סימון/ }).click();
    await tap(page, await at(page, 10.2, 45.3));
    expect(await page.evaluate(() => window.navplot.S.objects.at(-1)!.layer)).toBe('student');

    // The teacher brings the solution back in, next to the answer
    await page.locator('#fileSolution').setInputFiles(teacher);
    await expect.poll(() => page.evaluate(() => window.navplot.S.objects.map((o) => o.layer).sort())).toEqual(['base', 'solution', 'student']);

    // and everything comes back after a reload (autosave runs a moment after each change)
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator('#empty')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.navplot.S.objects.length)).toBe(3);
  });
});

for (const size of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 768, h: 1024 }]) {
  test.describe(`${size.w}px`, () => {
    test.use({ viewport: { width: size.w, height: size.h } });

    test('layout fits, every button works, accessible', async ({ page }) => {
      await openSample(page);
      await page.keyboard.press('KeyR');
      await page.keyboard.press('KeyO');
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: `${OUT}/${size.w}.png` });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.locator('#cv')).toBeInViewport();

      // every tool and instrument
      for (const b of await page.locator('#toolbar button').all()) {
        await b.click();
        await expect(b).toHaveAttribute('aria-pressed', /true|false/);
      }
      // the help window opens, fits and closes with Escape
      await page.getByRole('button', { name: 'עזרה' }).click();
      const dlg = page.locator('dialog[open]');
      await expect(dlg).toBeVisible();
      const r = (await dlg.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(size.w);
      await page.keyboard.press('Escape');
      await expect(dlg).toBeHidden();

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`);
      expect(serious).toEqual([]);
    });
  });
}
