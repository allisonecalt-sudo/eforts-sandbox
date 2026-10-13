/* global EFORTSPdf */
// Locks parent.html/parent.js end to end: fill -> code -> PDF file,
// validation, the localStorage draft, and the "no clinical output on this
// page" + "single source of instrument text" guards.
//
// FORMAT NOTE: fields are sex + date of birth only (no anon/code field) —
// see tests/helpers/eforts-parent.js and eforts-code.js header comments
// for the 2026-09-28 mid-build amendment that dropped age-Y+M and anon.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  setDob,
  gotoParent,
  fillParent,
  downloadPdf,
  GOLDEN,
  MODELS,
} = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));
});

test('fill -> code -> PDF file (G50)', async ({ page }) => {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();

  await expect(page.locator('#pDone')).toBeVisible();
  await expect(page.locator('#pFormSection')).toBeHidden();

  const pdf = await downloadPdf(page);
  expect(pdf.name).toBe('EFORTS-answers-2026-09-28-1000.pdf');
  const buf = fs.readFileSync(pdf.path);
  expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect(buf.toString('latin1')).toContain(GOLDEN.G50);
});

test('the done screen has no copy-code backup and no fold', async ({ page }) => {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeVisible();
  await expect(page.locator('#pAltWays, #pCode, #pCopy')).toHaveCount(0);
  await expect(page.locator('#pSendError')).toBeHidden();
});

test('PDF build failure shows #pSendError, keeps the button enabled; a tap retries and downloads', async ({
  page,
}) => {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.evaluate(() => {
    window.__realBuild = EFORTSPdf.build;
    EFORTSPdf.build = () => Promise.reject(new Error('boom'));
  });
  await page.locator('#pFinish').click();
  await expect(page.locator('#pSendError')).toBeVisible();
  await expect(page.locator('#pSendError')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#pSendError')).toHaveText(
    'לא הצלחנו ליצור את הקובץ. רעננו את הדף ונסו שוב.',
  );
  await expect(page.locator('#pSend')).toBeEnabled();

  await page.evaluate(() => {
    EFORTSPdf.build = window.__realBuild;
  });
  const pdf = await downloadPdf(page);
  expect(pdf.name).toBe('EFORTS-answers-2026-09-28-1000.pdf');
  expect(fs.readFileSync(pdf.path).toString('latin1')).toContain(GOLDEN.G50);
  await expect(page.locator('#pSendError')).toBeHidden();
});

test('validation: 29 of 30 answered blocks finish and marks the missing item', async ({ page }) => {
  await gotoParent(page);
  const model = { ...MODELS.G50, answers: MODELS.G50.answers.slice() };
  await page.locator('label[for="pSex_m"]').click();
  await setDob(page, model.dob);
  for (let i = 0; i < model.answers.length; i++) {
    if (i + 1 === 17) continue; // leave item 17 unanswered
    await page.locator(`label[for="pq${i + 1}_${model.answers[i]}"]`).click();
  }

  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeHidden();
  await expect(page.locator('#pMissing')).toBeVisible();
  await expect(page.locator('#pMissing')).toContainText('17');
  await expect(page.locator('#pItem17')).toHaveClass(/p-missing/);

  await page.locator(`label[for="pq17_${model.answers[16]}"]`).click();
  await expect(page.locator('#pItem17')).not.toHaveClass(/p-missing/);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeVisible();
});

test('validation: missing sex / missing date of birth', async ({ page }) => {
  await gotoParent(page);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pMissing')).toContainText('מין הילד/ה');
  await expect(page.locator('#pMissing')).toContainText('תאריך לידה');
});

test('draft: save mid-fill, reload restores it, clear removes it', async ({ page }) => {
  await gotoParent(page);
  await page.locator('label[for="pSex_m"]').click();
  for (let n = 1; n <= 5; n++) {
    await page.locator(`label[for="pq${n}_3"]`).click();
  }

  await gotoParent(page); // reload
  await expect(page.locator('#pDraftBar')).toBeVisible();
  await expect(page.locator('#pSex_m')).toBeChecked();
  for (let n = 1; n <= 5; n++) {
    await expect(page.locator(`#pq${n}_3`)).toBeChecked();
  }

  page.once('dialog', (d) => d.accept());
  await page.locator('#pDraftClear').click();
  await expect(page.locator('#pSex_m')).not.toBeChecked();
  const draftKey = await page.evaluate(() => localStorage.getItem('eforts_parent_draft_v1'));
  expect(draftKey).toBeNull();
});

test('draft: expires after 14 days', async ({ page }) => {
  await gotoParent(page);
  await page.evaluate(() => {
    const old = Date.now() - 15 * 24 * 3600 * 1000;
    localStorage.setItem(
      'eforts_parent_draft_v1',
      JSON.stringify({
        v: 1,
        savedAt: old,
        sex: 'male',
        dob: '2021-02-28',
        with: {},
        answers: { 1: 3 },
      }),
    );
  });
  await gotoParent(page); // reload with the stale draft present
  await expect(page.locator('#pDraftBar')).toBeHidden();
  const draftKey = await page.evaluate(() => localStorage.getItem('eforts_parent_draft_v1'));
  expect(draftKey).toBeNull();
});

test('never touches the clinician app key eforts_save', async ({ page }) => {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  const saveKey = await page.evaluate(() => localStorage.getItem('eforts_save'));
  expect(saveKey).toBeNull();
});

test('no clinical output ever appears on the parent page', async ({ page }) => {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeVisible();

  const globals = await page.evaluate(() => ({
    cutoffs: typeof window.cutoffs,
    calculate: typeof window.calculate,
    buildSummary: typeof window.buildSummary,
  }));
  expect(globals.cutoffs).toBe('undefined');
  expect(globals.calculate).toBe('undefined');
  expect(globals.buildSummary).toBe('undefined');

  expect(await page.locator('.score-value').count()).toBe(0);
  expect(await page.locator('.summary-card').count()).toBe(0);
  expect(await page.locator('.ef-note').count()).toBe(0);
  // P4: exactly the two routine dividers, no clinical sub-dividers
  expect(await page.locator('.sub-divider').allTextContents()).toEqual(['שגרת בוקר', 'שגרת ערב']);
});

test('single source: item legends match items[] verbatim, no hardcoded instrument text', async ({
  page,
}) => {
  await gotoParent(page);
  const mismatches = await page.evaluate(() => {
    const bad = [];
    items.forEach((it, i) => {
      const legend = document.querySelector(`#pItem${it.num} legend`);
      const expected = `${it.num}. ${it.text}`;
      if (!legend || legend.textContent !== expected) {
        bad.push({ num: it.num, got: legend && legend.textContent, expected });
      }
      void i;
    });
    return bad;
  });
  expect(mismatches).toEqual([]);

  const root = path.resolve(__dirname, '..');
  const parentJs = fs.readFileSync(path.join(root, 'parent.js'), 'utf8');
  const parentHtml = fs.readFileSync(path.join(root, 'parent.html'), 'utf8');

  // Pull the live items/SECTIONS/COMPANION text straight from the page so
  // this check can't drift from items.js on its own.
  const instrument = await page.evaluate(() => ({
    itemTexts: items.map((i) => i.text),
    instructions: SECTIONS.map((s) => s.instruction),
    companionQuestion: COMPANION.question,
  }));

  for (const text of instrument.itemTexts) {
    expect(parentJs.includes(text)).toBe(false);
    expect(parentHtml.includes(text)).toBe(false);
  }
  for (const instr of instrument.instructions) {
    expect(parentJs.includes(instr)).toBe(false);
    expect(parentHtml.includes(instr)).toBe(false);
  }
  expect(parentJs.includes(instrument.companionQuestion)).toBe(false);
  expect(parentHtml.includes(instrument.companionQuestion)).toBe(false);
});

test('header: parent.html .header matches index.html .header (h1 text swapped)', async ({
  page,
}) => {
  const root = path.resolve(__dirname, '..');
  const { pathToFileURL } = require('url');

  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  const indexHeader = await page.locator('.header').innerHTML();

  await gotoParent(page);
  const parentHeader = await page.locator('.header').innerHTML();

  const normalizedIndex = indexHeader.replace('קידוד שאלון · עמוד למטפל/ת', 'שאלון להורים');
  expect(parentHeader).toBe(normalizedIndex);
});

test('companion parity: index.html markup matches COMPANION exactly', async ({ page }) => {
  const root = path.resolve(__dirname, '..');
  const { pathToFileURL } = require('url');
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForSelector('#questionnaire .item-row');

  const result = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.companion-row span')].map((s) => s.textContent);
    const select = document.getElementById('companion_morning');
    const opts = [...select.options]
      .slice(1)
      .map((o) => ({ value: o.value, label: o.textContent }));
    return { spans, opts };
  });

  expect(result.spans.length).toBe(3);
  const companion = await page.evaluate(() => ({
    question: COMPANION.question,
    options: COMPANION.options,
  }));
  result.spans.forEach((t) => expect(t).toBe(companion.question));
  expect(result.opts).toEqual(companion.options);
});

test('RTL + phone widths: no horizontal overflow at 360 and 412', async ({ page }) => {
  for (const width of [360, 412]) {
    await page.setViewportSize({ width, height: 800 });
    await gotoParent(page);

    const langDir = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    }));
    expect(langDir.lang).toBe('he');
    expect(langDir.dir).toBe('rtl');

    const introOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(introOverflow).toBe(true);

    await fillParent(page, MODELS.G50);
    const filledOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(filledOverflow).toBe(true);

    // Missing state (blank dob) — leave dob empty then trigger validation.
    await gotoParent(page);
    await page.locator('#pFinish').click();
    const missingOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(missingOverflow).toBe(true);

    await gotoParent(page);
    await fillParent(page, MODELS.G50);
    await page.locator('#pFinish').click();
    const doneOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(doneOverflow).toBe(true);
  }
});
