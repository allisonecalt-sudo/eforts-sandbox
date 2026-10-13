// QA fix round, OT-input re-check leftovers (items 1-11): placeholder fit,
// manual birth-after-fill message, quoted-reply paste, collapsed-box drop,
// edge wording, fill-date messages, preview age wording, overwrite confirm,
// the app's own parent sheet uploaded by mistake, drop hint, copy status.

const { test, expect } = require('@playwright/test');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');
const { MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

const NOW = new Date('2026-10-11T10:00:00+03:00');
const EDGE_TEXT = 'קרוב לגבול טווח הגילים של השאלון — כדאי לוודא את תאריך הלידה.';

async function open(page) {
  await page.clock.setFixedTime(NOW);
  await gotoApp(page);
}

function codeFor(page, patch) {
  return page.evaluate(({ base, patch }) => EFORTSCode.encode(Object.assign({}, base, patch)), {
    base: MODELS.G50,
    patch,
  });
}

async function pasteCode(page, text) {
  await page.locator('#importCode').fill(text);
  await page.locator('#importCodeBtn').click();
}

test('1: the anonymous-number placeholder is short enough for a phone (130 px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page);
  await expect(page.locator('#anonId')).toHaveAttribute('placeholder', 'למשל 50 · בלי שם');
  const w = await page.evaluate(() => {
    const el = document.getElementById('anonId');
    const cs = window.getComputedStyle(el);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return ctx.measureText(el.placeholder).width;
  });
  expect(w).toBeLessThanOrEqual(130);
});

test('2: manual form, birth date after the fill date says so (not the out-of-range text)', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.setBirthDateValue('2026-10-11');
    window.setFillDateValue('2026-10-01');
    window.updateAge();
    document.getElementById('anonId').value = '5';
    document.getElementById('childGender').value = 'male';
    window.calculate();
  });
  await expect(page.locator('#warning')).toHaveText('תאריך הלידה מאוחר מתאריך המילוי.');
});

test('3: a code pasted from a quoted reply («> » on each line) imports', async ({ page }) => {
  await open(page);
  const code = await codeFor(page, {});
  const quoted = `> ${code.slice(0, 20)}\n> ${code.slice(20)}`;
  const plain = `${code.slice(0, 20)}\n${code.slice(20)}`;
  // the same code split over two lines imports, so the quoted one must too
  await pasteCode(page, plain);
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importCode').fill('');
  await pasteCode(page, `>> ${code}`);
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importCode').fill('');
  await pasteCode(page, quoted);
  await expect(page.locator('#importStatus')).not.toHaveClass(/err/);
});

test('4: a file chosen or dropped on a collapsed import box opens it first', async ({ page }) => {
  await open(page);
  const code = await codeFor(page, {});
  await page.locator('#importBox').evaluate((el) => (el.open = false));
  await page.setInputFiles('#importFile', {
    name: 'answers.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(code),
  });
  await expect(page.locator('#importBox')).toHaveJSProperty('open', true);
  await expect(page.locator('#importPreview')).toBeVisible();
});

for (const [label, dob] of [
  ['3y1m', '2023-09-05'],
  ['11y10m', '2014-12-05'],
]) {
  test(`5: outer edge ${label} uses the range-edge text`, async ({ page }) => {
    await open(page);
    await pasteCode(page, await codeFor(page, { dob, date: '2026-10-10' }));
    await expect(page.locator('#importEdge')).toHaveText(EDGE_TEXT);
  });
}

test('5: the age range is written one way on the form too', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.setBirthDateValue('2024-06-01');
    window.setFillDateValue('2026-10-01');
    window.updateAge();
  });
  await expect(page.locator('#ageGroupDisplay')).toHaveText(
    'מחוץ לטווח הגילים של השאלון (3 עד 11 שנים ו-11 חודשים)',
  );
});

test('6: a future fill date and an old one get their own messages, dd/mm/yyyy', async ({
  page,
}) => {
  await open(page);
  await pasteCode(page, await codeFor(page, { date: '2026-10-12' }));
  await expect(page.locator('#importStatus')).toHaveText(
    'תאריך המילוי בעתיד. בדוק/י את התאריך בקובץ.',
  );
  await pasteCode(page, await codeFor(page, { dob: '2015-01-01', date: '2020-01-15' }));
  await expect(page.locator('#importStatus')).toContainText('תאריך המילוי (15/01/2020) ישן מדי');
});

test('7: several different codes says «הדבק/י»', async ({ page }) => {
  await open(page);
  const a = await codeFor(page, {});
  const b = await codeFor(page, { sex: 'female' });
  await pasteCode(page, `${a}\n${b}`);
  await expect(page.locator('#importStatus')).toHaveText(
    'נמצאו כמה קודים שונים. הדבק/י קוד אחד בכל פעם.',
  );
});

test('8: the preview writes the age like the form', async ({ page }) => {
  await open(page);
  await pasteCode(page, await codeFor(page, { dob: '2023-09-05', date: '2026-10-10' }));
  await expect(page.locator('#importPreviewList')).toContainText('3 שנים וחודש');
  await pasteCode(page, await codeFor(page, { dob: '2022-10-05', date: '2026-10-10' }));
  await expect(page.locator('#importPreviewList')).toContainText('4 שנים');
  await expect(page.locator('#importPreviewList')).not.toContainText('4 שנים,');
});

test('10: uploading the app’s own parent sheet says it is the parents’ summary', async ({
  page,
}) => {
  await open(page);
  const scores = {};
  for (let i = 1; i <= 30; i++) scores[i] = 3;
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: scores,
    anonId: '7',
  });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-parent-pdf')]);
  await popup.waitForSelector('h1');
  const pdf = await popup.pdf({ preferCSSPageSize: true });
  await popup.close();
  await page.locator('#importBox').evaluate((el) => (el.open = true));
  await page.setInputFiles('#importFile', {
    name: 'sheet.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(page.locator('#importStatus')).toHaveText(
    'זה הסיכום להורים, לא קובץ התשובות. יש להעלות את קובץ התשובות שההורים שלחו.',
  );
});

test('11: «גרור/י» only with a mouse; copy status clears on reset; periods on date warnings', async ({
  page,
  browser,
}) => {
  await open(page);
  await expect(page.locator('#importDropHint')).toContainText('גרור/י');

  const ctx = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 800 },
    locale: 'he-IL',
  });
  const phone = await ctx.newPage();
  await gotoApp(phone);
  await expect(phone.locator('#importDropHint')).not.toContainText('גרור');
  await ctx.close();

  await page.evaluate(() => {
    const st = document.getElementById('sendStatus');
    st.className = 'import-status ok';
    st.textContent = 'הקישור הועתק ✓';
  });
  page.once('dialog', (d) => d.accept());
  await page.evaluate(() => window.resetForm());
  await expect(page.locator('#sendStatus')).toHaveText('');

  await page.locator('#calcBottom').click();
  await expect(page.locator('#warning')).toContainText('תאריך לידה');
});
