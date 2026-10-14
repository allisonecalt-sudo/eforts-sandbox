// 2026-10-14: Prof. Rosenblum's three header fixes (via Carmit Frisch, 11:45).
// The citation reads «© Frisch & Rosenblum, 2014» once, the lab line carries a
// rights mark, and one sentence says the tool is not Clalit's.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');

const CITE = '© Frisch & Rosenblum, 2014';
const LAB = '© המעבדה לבריאות תפקודית - תפקוד אנושי מורכב והשתתפות, אוניברסיטת חיפה';
const OWN =
  'השאלון וזכויותיו שייכים למחברות ולמעבדה באוניברסיטת חיפה, ולא לשירותי בריאות כללית; כללית שותפה למחשוב השאלון בלבד.';

const pages = ['index.html', 'parent.html'];

for (const file of pages) {
  test(`${file}: header shows ©, lab line, ownership sentence`, async ({ page }) => {
    await page.goto(pathToFileURL(path.resolve(__dirname, '..', file)).href);
    const header = page.locator('.header');
    const text = await header.innerText();
    expect(text.split(CITE).length - 1).toBe(1);
    expect(text).not.toContain('כרמית פריש');
    expect(text).not.toContain('CHAP');
    await expect(page.locator('.header-authors')).toHaveText(CITE);
    await expect(page.locator('.header-authors span')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('.header-lab')).toHaveText(LAB);
    await expect(page.locator('.header-ownership')).toHaveText(OWN);
    await expect(page.locator('.header-credit')).toContainText(
      'תהליך מחשוב השאלון בוצע ע"י אליסון אלט',
    );
    await expect(page.locator('.header-citation')).toHaveCount(0);
    // ownership sentence sits directly before the credit line
    const order = await page.evaluate(
      () => document.querySelector('.header-ownership').nextElementSibling.className,
    );
    expect(order).toBe('header-credit');
  });
}

test('OT PDF template carries ©, lab line, ownership, no old text', async ({ page }) => {
  await gotoApp(page);
  const scores = {};
  for (let n = 1; n <= 30; n++) scores[n] = 2;
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 5,
    ageMonthsBack: 0,
    itemScores: scores,
    anonId: '50',
  });
  const html = await page.evaluate(async () => {
    let written = '';
    window.open = () => ({
      document: { open() {}, write: (h) => (written += h), close() {} },
      focus() {},
      print() {},
    });
    await printResults();
    return written;
  });
  expect(html).toContain(
    `<div class="print-header-authors"><span dir="ltr">${CITE.replace('&', '&amp;')}</span></div>`,
  );
  expect(html).toContain(`<div class="print-header-lab">${LAB}</div>`);
  expect(html).toContain(OWN);
  expect(html.indexOf(OWN)).toBeLessThan(html.indexOf('תהליך מחשוב השאלון'));
  expect(html).toContain('EFORTS © Frisch & Rosenblum, 2014 | נורמות: Frisch & Rosenblum, 2024');
  expect(html).not.toContain('כרמית פריש');
  expect(html).not.toContain('CHAP');
  expect(html.split('Frisch &amp; Rosenblum, 2014').length - 1).toBe(1);
});

test('parent sheet carries the © line and footer', async ({ page }) => {
  await gotoApp(page);
  const html = await page.evaluate(() => {
    const scores = {};
    for (let n = 1; n <= 30; n++) scores[n] = 3;
    return buildParentSheetHtml({
      sexRaw: 'male',
      ageText: '5',
      fillDateText: '01/01/2026',
      scores,
      c: cutoffs[document.getElementById('ageGroup').value] || Object.values(cutoffs)[0],
      note: '',
      contact: '',
    });
  });
  expect(html).toContain(
    '<div class="q-authors"><span dir="ltr">© Frisch &amp; Rosenblum, 2014</span></div>',
  );
  expect(html).toContain(
    'EFORTS © Frisch &amp; Rosenblum, 2014 · הסיכום נכתב להורים ואינו מחליף את דוח האבחון.',
  );
  expect(html).not.toContain('כרמית פריש');
});
