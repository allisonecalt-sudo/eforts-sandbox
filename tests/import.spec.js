// PF2 — import parent answers into the clinician app.
//
// Covers the round trip end to end (parent.html fill -> code/file -> the
// app's import box -> the app's own calculate()) for all three model
// patients, plus every error path and the overwrite-confirm / band-edge
// behavior. Reuses tests/helpers/eforts-app.js (gotoApp — the real
// index.html/app.js, no re-implementation) and
// tests/helpers/eforts-parent.js (gotoParent/fillParent/GOLDEN/MODELS —
// the real parent.html/parent.js), same file:// pattern both already use.
//
// AMENDED 2026-09-28 12:31 (Allison, mid-build): the codec carries sex +
// dob (real date of birth, not an estimate) + date + with + 30 answers —
// no anonymous id. Import clears #anonId (O1, 2026-10-11); the therapist types it
// herself after import, then presses "חשב ציונים". See eforts-code.js and
// app.js's "IMPORT PARENT ANSWERS (PF2)" section for the implementation.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { gotoApp } = require('./helpers/eforts-app');
const { gotoParent, fillParent, downloadPdf, GOLDEN, MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

const FIXED_NOW = new Date('2026-09-28T10:00:00+03:00');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}
function loadGoldenSummary(name) {
  return fs.readFileSync(path.join(GOLDEN_DIR, name), 'utf8');
}

async function openImportBox(page, fixedTime = FIXED_NOW) {
  await page.clock.setFixedTime(fixedTime);
  await gotoApp(page);
  await page.locator('#importBox').evaluate((el) => {
    el.open = true;
  });
}

async function importByCode(page, code) {
  await page.locator('#importCode').fill(code);
  await page.locator('#importCodeBtn').click();
}

// Reads the app's live state back into a C.2-shaped model — the codec's
// own encode() can then be compared byte-for-byte against GOLDEN (D.4's
// round-trip guarantee). getBirthDateValue/getFillDateValue/items are
// app.js's own classic-script globals (see eforts-app.js header comment
// for why page.evaluate() can call them directly).
async function readAppModel(page) {
  return page.evaluate(() => ({
    sex: document.getElementById('childGender').value,
    dob: getBirthDateValue(),
    date: getFillDateValue(),
    with: {
      morning: document.getElementById('companion_morning').value,
      play: document.getElementById('companion_play').value,
      social: document.getElementById('companion_social').value,
    },
    answers: items.map((it) => {
      const r = document.querySelector(`input[name="q${it.num}"]:checked`);
      return r ? Number(r.value) : null;
    }),
  }));
}

async function runRoundTrip(
  page,
  { modelName, fixtureFile, summaryFile, ageGroup, ageText, anonId },
) {
  await page.clock.setFixedTime(FIXED_NOW);
  await gotoParent(page);
  await fillParent(page, MODELS[modelName]);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeVisible();
  const code = await page.evaluate((m) => EFORTSCode.encode(m), MODELS[modelName]);
  expect(code).toBe(GOLDEN[modelName]);

  await openImportBox(page);
  await importByCode(page, code);
  await expect(page.locator('#importPreview')).toBeVisible();

  await page.locator('#importAnon').fill(anonId);
  await page.locator('#importApply').click();
  await expect(page.locator('#importStatus')).toHaveClass(/ok/);
  await expect(page.locator('#results')).toBeVisible(); // O1: fill + calculate in one press

  // lossless (§D.4): re-encoding the app's own state reproduces the exact
  // golden string the parent page generated.
  const roundTripModel = await readAppModel(page);
  const reencoded = await page.evaluate((m) => EFORTSCode.encode(m), roundTripModel);
  expect(reencoded).toBe(GOLDEN[modelName]);

  expect(await page.locator('#ageGroup').inputValue()).toBe(ageGroup);
  expect(await page.locator('#calcAge').textContent()).toBe(ageText);

  expect(await page.locator('#anonId').inputValue()).toBe(anonId);

  const fixture = loadFixture(fixtureFile);
  const scores = (await page.locator('.score-value').allTextContents()).map((s) => s.trim());
  expect(scores).toEqual([
    fixture.expected.morning.toFixed(2),
    fixture.expected.play.toFixed(2),
    fixture.expected.social.toFixed(2),
    fixture.expected.total.toFixed(2),
    fixture.expected.inhibition.toFixed(2),
    fixture.expected.workingMemory.toFixed(2),
    fixture.expected.flexibility.toFixed(2),
  ]);

  const summaryHtml = await page.locator('.summary-text').innerHTML();
  expect(summaryHtml).toBe(loadGoldenSummary(summaryFile));

  return { code };
}

test.describe('PF2 import — round trip', () => {
  test('model 50 (3-5, male): parent code -> import -> apply -> calculate', async ({ page }) => {
    await runRoundTrip(page, {
      modelName: 'G50',
      fixtureFile: 'model-50.json',
      summaryFile: 'model-50.summary.txt',
      ageGroup: '3-5',
      ageText: '5 שנים ו-7 חודשים',
      anonId: '50',
    });

    // preview contents (spec §F PF2 test 1) — checked once here, on the
    // model that exercises non-empty companions too.
  });

  test('model 32 (6-7, male, no companions)', async ({ page }) => {
    await runRoundTrip(page, {
      modelName: 'G32',
      fixtureFile: 'model-32.json',
      summaryFile: 'model-32.summary.txt',
      ageGroup: '6-7',
      // Gemini review item 16: "ו-2 חודשים" -> "וחודשיים" (natural Hebrew).
      ageText: '6 שנים וחודשיים',
      anonId: '32',
    });
  });

  test('model 50f (3-5, female)', async ({ page }) => {
    await runRoundTrip(page, {
      modelName: 'G50F',
      fixtureFile: 'model-50f.json',
      summaryFile: 'model-50f.summary.txt',
      ageGroup: '3-5',
      ageText: '5 שנים ו-7 חודשים',
      anonId: '50f',
    });
  });
});

test('preview rows show the parent-reported details before apply', async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  const code = await page.evaluate((m) => EFORTSCode.encode(m), MODELS.G50);

  await openImportBox(page);
  await importByCode(page, code);
  await expect(page.locator('#importPreview')).toBeVisible();

  const previewText = await page.locator('#importPreviewList').innerText();
  expect(previewText).toContain('בן');
  expect(previewText).toContain('5 שנים ו-7 חודשים');
  expect(previewText).toContain('28/09/2026');
  expect(previewText).toContain('30 מתוך 30');
});

test('file import path matches the code-paste path', async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();

  const filePath = (await downloadPdf(page)).path;
  expect(filePath).toBeTruthy();

  await openImportBox(page);
  await page.setInputFiles('#importFile', filePath);
  await expect(page.locator('#importPreview')).toBeVisible();

  await page.locator('#importAnon').fill('7');

  await page.locator('#importApply').click();
  await expect(page.locator('#importStatus')).toHaveClass(/ok/);
  expect(await page.locator('#childGender').inputValue()).toBe('male');
  expect(await page.locator('#ageGroup').inputValue()).toBe('3-5');

  const roundTripModel = await readAppModel(page);
  const reencoded = await page.evaluate((m) => EFORTSCode.encode(m), roundTripModel);
  expect(reencoded).toBe(GOLDEN.G50);

  // the file input is reset so the same file can be re-chosen
  expect(await page.locator('#importFile').inputValue()).toBe('');
});

test.describe('PF2 import — errors leave the form untouched', () => {
  const cases = [
    ['BAD_SUM (bad checksum) -> E3', () => GOLDEN.BAD_SUM, 'E3'],
    ['BAD_29 (29 answers) -> E6', () => GOLDEN.BAD_29, 'E6'],
    ['BAD_6 (answer out of range) -> E7', () => GOLDEN.BAD_6, 'E7'],
    ["'hello' (no code) -> E1", () => 'hello', 'E1'],
  ];

  for (const [label, getText, code] of cases) {
    test(label, async ({ page }) => {
      const inputText = getText();
      await openImportBox(page);

      // decode() error code sanity, independent of the Hebrew wording
      const decoded = await page.evaluate((t) => EFORTSCode.decode(t), inputText);
      expect(decoded.error).toBe(code);

      await importByCode(page, inputText);
      await expect(page.locator('#importPreview')).toBeHidden();
      const status = page.locator('#importStatus');
      await expect(status).toHaveClass(/err/);
      const text = await status.textContent();
      expect(text.length).toBeGreaterThan(0);

      expect(await page.locator('#anonId').inputValue()).toBe('');
      const checkedCount = await page.locator('#questionnaire input[type="radio"]:checked').count();
      expect(checkedCount).toBe(0);
    });
  }

  test('25 KB file -> F1 (too large)', async ({ page }) => {
    await openImportBox(page);
    const bigFile = {
      name: 'too-big.txt',
      mimeType: 'text/plain',
      buffer: Buffer.alloc(25000, 'a'),
    };
    await page.setInputFiles('#importFile', bigFile);
    await expect(page.locator('#importPreview')).toBeHidden();
    await expect(page.locator('#importStatus')).toHaveClass(/err/);
    await expect(page.locator('#importStatus')).toContainText('גדול מדי');
  });

  test('fill date older than 3 years -> E10', async ({ page }) => {
    await openImportBox(page);
    const oldCode = await page.evaluate(() =>
      EFORTSCode.encode({
        sex: 'male',
        dob: '2016-02-28',
        date: '2022-09-28',
        with: { morning: '', play: '', social: '' },
        answers: Array(30).fill(3),
      }),
    );
    await importByCode(page, oldCode);
    await expect(page.locator('#importPreview')).toBeHidden();
    await expect(page.locator('#importStatus')).toHaveClass(/err/);
    await expect(page.locator('#importStatus')).toContainText('ישן מדי');
  });
});

test('overwrite confirm: dismiss keeps the existing form, accept replaces it', async ({ page }) => {
  await openImportBox(page);

  // pre-fill the form with a different case. The scale radios are visually
  // hidden (item-scores input[type=radio] { opacity: 0 }) and checked via
  // their paired label, same as a real click on the app.
  await page.fill('#anonId', '32');
  await page.locator('label[for="q1_2"]').click();
  await page.locator('label[for="q2_2"]').click();
  await page.locator('label[for="q3_2"]').click();

  await importByCode(page, GOLDEN.G50);
  await expect(page.locator('#importPreview')).toBeVisible();

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();
  expect(await page.locator('#anonId').inputValue()).toBe('32');
  expect(await page.locator('#q1_2').isChecked()).toBe(true);
  expect(await page.locator('#q2_2').isChecked()).toBe(true);
  expect(await page.locator('#q3_2').isChecked()).toBe(true);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();
  await expect(page.locator('#importStatus')).toHaveClass(/ok/);
  expect(await page.locator('#anonId').inputValue()).toBe('7'); // UX O1: the number typed in the preview replaces the previous child's
  expect(await page.locator('#childGender').inputValue()).toBe('male');
  expect(await page.locator('#q1_1').isChecked()).toBe(true); // G50's item 1 answer is 1
});

test('band edge (5;11) shows the warning and still lands in band 3-5', async ({ page }) => {
  await openImportBox(page);
  const edgeCode = await page.evaluate((base) => {
    const model = Object.assign({}, base, { dob: '2020-10-28' });
    return EFORTSCode.encode(model);
  }, MODELS.G50);

  await importByCode(page, edgeCode);
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();

  await expect(page.locator('#results .results-edge')).toBeVisible();
  await expect(page.locator('#results .results-edge')).toContainText('קרוב לגבול');
  expect(await page.locator('#ageGroup').inputValue()).toBe('3-5');
  expect(await page.locator('#calcAge').textContent()).toBe('5 שנים ו-11 חודשים');
});

test('cancel clears the preview without applying', async ({ page }) => {
  await openImportBox(page);
  await importByCode(page, GOLDEN.G50);
  await expect(page.locator('#importPreview')).toBeVisible();

  await page.locator('#importCancel').click();
  await expect(page.locator('#importPreview')).toBeHidden();
  expect(await page.locator('#childGender').inputValue()).toBe('');
  const checkedCount = await page.locator('#questionnaire input[type="radio"]:checked').count();
  expect(checkedCount).toBe(0);
});
