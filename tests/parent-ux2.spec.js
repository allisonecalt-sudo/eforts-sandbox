/* global getComputedStyle, EFORTSPdf, state, Image */
// UX round 2 (parent page): scroll below the bar, share message, details+gaps
// bar, download message, answers PDF layout, the two small links.

const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { setDob, gotoParent, fillParent, downloadPdf, MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));
});

// waits until a smooth scroll has stopped
async function settle(page) {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (y === last) return;
    last = y;
    await page.waitForTimeout(200);
  }
}

async function answer(page, skip) {
  for (let n = 1; n <= 30; n++) {
    if (!skip.includes(n)) await page.locator(`label[for="pq${n}_3"]`).click();
  }
}

test('1. the gap jump lands fully below the sticky bar, gap row showing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoParent(page);
  await page.locator('label[for="pSex_m"]').click();
  await setDob(page, '2021-05-10');
  await answer(page, [12, 25]);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pBarGap')).toBeVisible();
  await page.locator('#pBarGap').click();
  await settle(page);
  const [barBottom, itemTop] = await page.evaluate(() => [
    document.querySelector('.progress-wrap').getBoundingClientRect().bottom,
    document.getElementById('pItem12').getBoundingClientRect().top,
  ]);
  expect(itemTop).toBeGreaterThanOrEqual(barBottom);
  const margin = await page.$eval('#pItem12', (e) => getComputedStyle(e).scrollMarginTop);
  expect(parseInt(margin, 10)).toBeGreaterThanOrEqual(112);
});

test('2. after a share: green «✓ נשלח?» pointing to the delete link below', async ({ page }) => {
  await page.addInitScript(() => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /pointer:\s*coarse/.test(q)
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
        : mm(q);
    navigator.canShare = () => true;
    navigator.share = async () => {};
  });
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  await page.locator('#pSend').click();
  const hint = page.locator('#pSendHint');
  await expect(hint).toHaveText('✓ נשלח? מצוין. כדאי למחוק את התשובות מהמכשיר (למטה).');
  const rgb = await hint.evaluate((e) => getComputedStyle(e).color);
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b);
});

test('4. details missing too: bar says so, and its tap goes to the details card first', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoParent(page);
  await answer(page, [3, 20]);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pBarGap')).toHaveText('חסרים פרטי הילד/ה ועוד 2 תשובות');
  await page.locator('#pBarGap').click();
  await settle(page);
  const top = await page.$eval('#pDetails', (e) => e.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(300);
  await page.locator('label[for="pq3_3"]').click();
  await expect(page.locator('#pBarGap')).toHaveText('חסרים פרטי הילד/ה ועוד תשובה אחת');
});

test('5. download message: two lines around the file name, no parenthesis around it', async ({
  page,
}) => {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  const { name } = await downloadPdf(page);
  const hint = page.locator('#pSendHint');
  await expect(hint).toContainText('הקובץ ירד למכשיר (בדרך כלל לתיקיית ההורדות):');
  await expect(hint.locator('bdi.p-filename')).toHaveText(name);
  await expect(hint).toContainText('עכשיו פתחו את המייל, צרפו את הקובץ ושלחו למטפל/ת.');
});

test('6. answers PDF: «פריט N: label (v)», two columns, one page, code still in the file', async ({
  page,
}) => {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  const lines = await page.evaluate(() =>
    EFORTSPdf.bodyLines(state.model)
      .filter((l) => l.kind === 'item')
      .map((l) => l.text),
  );
  expect(lines).toHaveLength(30);
  lines.forEach((t, i) =>
    expect(t.startsWith(`פריט ${i + 1}: `) && /\([1-5]\)$/.test(t)).toBe(true),
  );
  const { path } = await downloadPdf(page);
  const buf = fs.readFileSync(path).toString('latin1');
  expect(buf).toContain('EFORTS1|');
  expect((buf.match(/\/Type\s*\/Page\b/g) || []).length).toBe(1);
  const geo = await page.evaluate(async () => {
    const png = state.pdfPngs[0];
    const img = new Image();
    img.src = png;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    // ink in the left and right halves of the middle band => two columns
    const band = ctx.getImageData(0, Math.round(img.height * 0.3), img.width, 200).data;
    let left = 0;
    let right = 0;
    for (let i = 0; i < band.length; i += 4) {
      if (band[i] < 100) {
        const x = (i / 4) % img.width;
        if (x < img.width / 2) left++;
        else right++;
      }
    }
    return { left, right };
  });
  expect(geo.left).toBeGreaterThan(200);
  expect(geo.right).toBeGreaterThan(200);
});

test('7. «איפוס» looks the same in the draft bar and under «סיום»; the download link is 44px', async ({
  page,
}) => {
  await gotoParent(page);
  await page.locator('label[for="pSex_m"]').click();
  await gotoParent(page);
  const css = (id) =>
    page.$eval('#' + id, (e) => {
      const c = getComputedStyle(e);
      return [c.color, c.fontSize, c.fontWeight, c.textDecorationLine, c.backgroundColor].join('|');
    });
  expect(await css('pDraftClear')).toBe(await css('pReset'));
  const h = await page.$eval('#pDraftClear', (e) => e.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
});

test('7b. «או: הורדת הקובץ למכשיר» is at least 44px tall', async ({ page }) => {
  await page.addInitScript(() => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /pointer:\s*coarse/.test(q)
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
        : mm(q);
    navigator.canShare = () => true;
    navigator.share = async () => {};
  });
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  const h = await page.$eval('#pDownloadOnly', (e) => e.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
});
