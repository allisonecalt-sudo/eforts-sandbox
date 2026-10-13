// QA fix round, section C: the OT page flow (moving to the next child,
// reopening the page, warnings under the sticky bar, blocked storage, the
// import preview checks, wording). Each test names the QA item it covers.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');
const { GOLDEN, MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

const NOW = new Date('2026-10-11T10:00:00+03:00');

const SCORES = {};
for (let i = 1; i <= 30; i++) SCORES[i] = 3;

async function openFresh(page) {
  await page.clock.setFixedTime(NOW);
  await gotoApp(page);
}

function savedForm(extra) {
  const answers = {};
  for (let i = 1; i <= 30; i++) answers[i] = 3;
  return Object.assign(
    {
      anonId: '77',
      gender: 'male',
      birthDate: '2020-03-15',
      fillDate: '2026-10-11',
      companions: { morning: 'mom', play: '', social: '' },
      answers,
    },
    extra,
  );
}

async function seedAndReload(page, data) {
  await page.evaluate((d) => sessionStorage.setItem('eforts_save', JSON.stringify(d)), data);
  await page.reload();
  await page.waitForSelector('#questionnaire .item-row');
}

async function importCodeWith(page, patch) {
  const code = await page.evaluate(
    ({ base, patch }) => EFORTSCode.encode(Object.assign({}, base, patch)),
    { base: MODELS.G50, patch },
  );
  await page.locator('#importBox').evaluate((el) => (el.open = true));
  await page.locator('#importCode').fill(code);
  await page.locator('#importCodeBtn').click();
}

// waits until window.scrollY stops changing (smooth scroll finished)
async function settleScroll(page) {
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const y = window.scrollY;
        setTimeout(() => resolve(window.scrollY === y), 250);
      }),
    null,
    { timeout: 10000, polling: 300 },
  );
}

// ===== O1 =====
test('O1: import replaces the previous number with the one typed in the preview, and the confirm says so', async ({
  page,
}) => {
  await openFresh(page);
  await page.fill('#anonId', '32');
  await page.locator('label[for="q1_2"]').click();
  await importCodeWith(page, {});
  await expect(page.locator('#importPreview')).toBeVisible();
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    d.accept();
  });
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();
  await expect(page.locator('#importStatus')).toHaveClass(/ok/);
  expect(message).toBe('הטופס כבר מכיל נתונים. הייבוא יחליף אותם, כולל המספר האנונימי. להמשיך?');
  expect(await page.locator('#anonId').inputValue()).toBe('7');
});

// ===== O2 =====
test('O2: reopening lands on the form with the restore bar; «שאלון חדש» clears it', async ({
  page,
}) => {
  await openFresh(page);
  await seedAndReload(page, savedForm());
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#formSection')).toBeVisible();
  await expect(page.locator('#sendBox')).toBeVisible();
  await expect(page.locator('#importBox')).toBeVisible();
  await expect(page.locator('#restoreBar')).toBeVisible();
  await expect(page.locator('#restoreText')).toHaveText("נטען השאלון שנשמר בלשונית זו (מס' 77).");
  expect(await page.locator('#anonId').inputValue()).toBe('77');
  await expect(page.locator('#progressText')).toHaveText('30 / 30');
  await expect(page.locator('#results .results-header')).toHaveCount(0); // never auto-calculated

  page.once('dialog', (d) => d.accept());
  await page.locator('#restoreNew').click();
  await expect(page.locator('#restoreBar')).toBeHidden();
  expect(await page.locator('#anonId').inputValue()).toBe('');
  await expect(page.locator('#progressText')).toHaveText('0 / 30');
});

test('O2: the companion selects auto-save like every other field', async ({ page }) => {
  await openFresh(page);
  await page.selectOption('#companion_play', 'dad');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('eforts_save')));
  expect(saved.companions.play).toBe('dad');
});

// ===== O3 =====
test('O10: a warning scrolls to its field, focuses and marks it, and sits under it', async ({
  page,
}) => {
  await openFresh(page);
  await page.locator('#calcBottom').scrollIntoViewIfNeeded();
  await page.locator('#calcBottom').click();
  await expect(page.locator('#warning')).toBeVisible();
  await expect(page.locator('#anonId')).toBeFocused();
  await expect(page.locator('#anonId')).toHaveClass(/field-invalid/);
  await expect(page.locator('#anonId')).toHaveAttribute('aria-invalid', 'true');
  // the message is in the same card as the field, after it, and on screen
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const f = document.getElementById('anonId').getBoundingClientRect();
          const w = document.getElementById('warning').getBoundingClientRect();
          return w.top >= f.bottom && w.top >= 0 && w.bottom <= window.innerHeight;
        }),
      { timeout: 8000 },
    )
    .toBe(true);
});

// ===== O4 =====
test('O4: with storage blocked, manual entry and calculate still work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const blocked = () => {
      throw new Error('blocked');
    };
    Object.defineProperty(window, 'localStorage', { get: blocked });
    Object.defineProperty(window, 'sessionStorage', { get: blocked });
  });
  await openFresh(page);
  await expect(page.locator('#progressText')).toHaveText('0 / 30');
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: SCORES,
    anonId: '501',
  });
  await expect(page.locator('#results .results-header')).toBeVisible();
  // saving fails quietly and says so
  await page.evaluate(() => {
    document.getElementById('formSection').style.display = 'block';
  });
  await page.evaluate(() => window.saveForm());
  await expect(page.locator('#saveIndicator')).toContainText('חוסם');
  expect(errors).toEqual([]);
});

test('O4: with storage blocked, import still works', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  });
  await openFresh(page);
  await importCodeWith(page, {});
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();
  await expect(page.locator('#importStatus')).toHaveClass(/ok/);
  await expect(page.locator('#progressText')).toHaveText('30 / 30');
});

// ===== progress label =====
test('progress shows «0 / 30» on a fresh load, isolated left-to-right', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('#progressText')).toHaveText('0 / 30');
  await expect(page.locator('#progressText bdi')).toHaveAttribute('dir', 'ltr');
});

// ===== parent note in memory =====
test('the OT note to the parents survives back → calculate, never stored', async ({ page }) => {
  await openFresh(page);
  await fillAndCalculate(page, {
    sex: 'female',
    ageYearsBack: 6,
    ageMonthsBack: 3,
    itemScores: SCORES,
    anonId: '12',
  });
  await page.fill('#parentNote', 'דבר אחד לנסות');
  await page.locator('button:text-is("חזרה לשאלון")').click();
  await page.evaluate(() => calculate());
  await expect(page.locator('#parentNote')).toHaveValue('דבר אחד לנסות');
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain('דבר אחד');
  const ai = await page.evaluate(() => buildExportText());
  expect(ai).not.toContain('דבר אחד');
  // a new questionnaire starts without the old note
  page.once('dialog', (d) => d.accept());
  await page.locator('.btn-new').click();
  await fillAndCalculate(page, {
    sex: 'female',
    ageYearsBack: 6,
    ageMonthsBack: 3,
    itemScores: SCORES,
    anonId: '13',
  });
  await expect(page.locator('#parentNote')).toHaveValue('');
});

// ===== preview checks =====
test('import preview: date of birth after the fill date is an error with no «מילוי הטופס»', async ({
  page,
}) => {
  await openFresh(page);
  await importCodeWith(page, { dob: '2027-01-01', date: '2026-10-10' });
  await expect(page.locator('#importStatus')).toHaveClass(/err/);
  await expect(page.locator('#importStatus')).toHaveText('תאריך הלידה מאוחר מתאריך המילוי.');
  await expect(page.locator('#importPreview')).toBeHidden();
  await expect(page.locator('#importApply')).toBeHidden();
});

for (const [label, dob] of [
  ['under 3.0', '2024-06-01'],
  ['over 11.11', '2013-01-01'],
]) {
  test(`import preview: age ${label} shows the range warning`, async ({ page }) => {
    await openFresh(page);
    await importCodeWith(page, { dob, date: '2026-10-10' });
    await expect(page.locator('#importPreview')).toBeVisible();
    await expect(page.locator('#importEdge')).toBeVisible();
    await expect(page.locator('#importEdge')).toHaveText(
      'הגיל מחוץ לטווח הגילים של השאלון (3 עד 11 שנים ו-11 חודשים).',
    );
  });
}

for (const [label, dob] of [
  ['3y0m', '2023-10-05'],
  ['11y11m', '2014-11-05'],
]) {
  test(`import preview: outer edge (${label}) warns in the preview`, async ({ page }) => {
    await openFresh(page);
    await importCodeWith(page, { dob, date: '2026-10-10' });
    await expect(page.locator('#importPreview')).toBeVisible();
    await expect(page.locator('#importEdge')).toHaveText(
      'קרוב לגבול טווח הגילים של השאלון — כדאי לוודא את תאריך הלידה.',
    );
  });
}

test('import preview: a band edge warns in the preview too (before applying)', async ({ page }) => {
  await openFresh(page);
  await importCodeWith(page, { dob: '2020-10-28', date: '2026-10-10' });
  await expect(page.locator('#importPreview')).toBeVisible();
  await expect(page.locator('#importEdge')).toContainText('קרוב לגבול בין קבוצות גיל');
});

test('a successful paste check scrolls the preview into view below the bar', async ({ page }) => {
  await openFresh(page);
  await importCodeWith(page, {});
  await expect(page.locator('#importPreview')).toBeVisible();
  await settleScroll(page);
  const prev = await page.locator('#importPreview').boundingBox();
  expect(prev.y).toBeGreaterThanOrEqual(0); // not parked above the top of the screen
});

test('an image file is «not an answers file», not «too big»', async ({ page }) => {
  await openFresh(page);
  await page.setInputFiles('#importFile', {
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(30000, 1),
  });
  await expect(page.locator('#importStatus')).toHaveClass(/err/);
  await expect(page.locator('#importStatus')).toHaveText(
    'זה לא קובץ תשובות. יש לבחור את קובץ ה-PDF שההורים שלחו.',
  );
  await expect(page.locator('#importStatus')).not.toContainText('גדול מדי');
});

test('typing in the code box after a preview hides the stale preview', async ({ page }) => {
  await openFresh(page);
  await importCodeWith(page, {});
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importCode').press('x');
  await expect(page.locator('#importPreview')).toBeHidden();
  await page.locator('#importApply').evaluate((el) => el.isConnected);
});

// ===== anonymous number wording =====
test('anonymous number: label, placeholder and warning match the real use', async ({ page }) => {
  await openFresh(page);
  await expect(page.locator('label[for="anonId"]')).toHaveText(
    'מספר אנונימי (מופיע בכותרות ובשמות הקבצים, לא בסיכום)',
  );
  await expect(page.locator('#anonId')).toHaveAttribute('placeholder', 'למשל 50 · בלי שם');
  await page.evaluate(() => {
    document.getElementById('childGender').value = 'male';
  });
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: SCORES,
    anonId: ' ',
  });
  await expect(page.locator('#warning')).toHaveText(
    'יש להזין מספר אנונימי — הוא מופיע בכותרת ובשמות הקבצים במקום שם.',
  );
});

// ===== impossible dates =====
for (const [d, m] of [
  [31, 1], // 31 Feb
  [30, 1], // 30 Feb
  [31, 3], // 31 Apr
]) {
  test(`date that does not exist (${d}/${m + 1}) is refused`, async ({ page }) => {
    await openFresh(page);
    await fillAndCalculate(page, {
      sex: 'male',
      ageYearsBack: 6,
      ageMonthsBack: 0,
      itemScores: SCORES,
      anonId: '9',
    });
    // fillAndCalculate already showed results for a valid date; go back, break the date
    await page.evaluate(
      ({ d, m }) => {
        window.goBack();
        document.getElementById('birthYear').value = '2020';
        document.getElementById('birthMonth').value = String(m);
        document.getElementById('birthDay').value = String(d);
        updateAge();
        calculate();
      },
      { d, m },
    );
    await expect(page.locator('#warning')).toHaveText('התאריך אינו קיים בלוח השנה.');
    await expect(page.locator('#results .results-header')).toBeHidden();
  });
}

// ===== phone =====
test('phone width: no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openFresh(page);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});

// ===== downloads =====
test('AI button name; AI file has a BOM and the raw number; Clicks shows the how-to line', async ({
  page,
}) => {
  await openFresh(page);
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: SCORES,
    anonId: ' A&B 7 ',
  });
  await expect(page.locator('.btn-ai')).toHaveText('הורדה ל-AI (טקסט)');
  await expect(page.locator('.ai-help')).toContainText('הורדה ל-AI (טקסט)');

  const [aiDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.btn-ai').click(),
  ]);
  const bytes = fs.readFileSync(await aiDownload.path());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = bytes.toString('utf8');
  expect(text).toContain('מספר אנונימי: A&B 7 |');
  expect(text).not.toContain('&amp;');

  await expect(page.locator('#downloadStatus')).toHaveText('');
  const [clicks] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.btn-clicks').click(),
  ]);
  await clicks.path();
  await expect(page.locator('#downloadStatus')).toHaveText(
    'הקובץ ירד. פתח/י אותו (ייפתח בפנקס הרשימות), סמנ/י הכול והעתק/י לקליקס.',
  );
});

// the old constant is still referenced by older tests; keep the import honest
test('GOLDEN codes are still available to the flow tests', () => {
  expect(typeof GOLDEN.G50).toBe('string');
});
