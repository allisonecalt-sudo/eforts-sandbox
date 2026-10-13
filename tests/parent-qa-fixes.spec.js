/* global EFORTSPdf, getComputedStyle, state */
// QA fix round 2026-10-11 (parent page only): share path on phones only,
// date-of-birth validation, field marking, a never-stale missing message,
// grammar, device hint, PDF-build retry, draft cleared by an emptying undo.

const { test, expect } = require('@playwright/test');
const { setDob, getDob, gotoParent, fillParent, MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));
});

// Fixed "today" is 2026-09-28.
function stubDevice(page, { coarse, canShare }) {
  return page.addInitScript(
    ({ coarse: c, canShare: s }) => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /pointer:\s*coarse/.test(q)
          ? { matches: c, media: q, addEventListener() {}, removeEventListener() {} }
          : mm(q);
      if (s) {
        navigator.canShare = (d) => !!(d && d.files && d.files.length);
        navigator.share = async () => {};
      } else {
        Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
      }
    },
    { coarse, canShare },
  );
}

async function finish(page, model = MODELS.G50) {
  await gotoParent(page);
  await fillParent(page, model);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeVisible();
}

test.describe('1. share path only on phones', () => {
  test('desktop (fine pointer) with canShare true gets the download path', async ({ page }) => {
    await stubDevice(page, { coarse: false, canShare: true });
    await finish(page);
    await expect(page.locator('#pSend')).toHaveText('הורדת קובץ התשובות (PDF)');
    await expect(page.locator('#pSendHint')).toHaveText(
      'צרפו את הקובץ למייל ושלחו לכתובת שקיבלתם מהמטפל/ת.',
    );
    await expect(page.locator('#pDownloadOnly')).toBeHidden();
  });

  test('phone (coarse pointer) with canShare true gets the share path + download link', async ({
    page,
  }) => {
    await stubDevice(page, { coarse: true, canShare: true });
    await finish(page);
    await expect(page.locator('#pSend')).toHaveText('שליחת קובץ התשובות (PDF)');
    await expect(page.locator('#pDownloadOnly')).toBeVisible();
  });

  test('6. phone without file sharing is never told "במחשב"', async ({ page }) => {
    await stubDevice(page, { coarse: true, canShare: false });
    await finish(page);
    await expect(page.locator('#pSend')).toHaveText('הורדת קובץ התשובות (PDF)');
    await expect(page.locator('#pSendHint')).toHaveText(
      'צרפו את הקובץ למייל ושלחו לכתובת שקיבלתם מהמטפל/ת.',
    );
    await expect(page.locator('#pDownloadOnly')).toBeHidden();
  });
});

test.describe('2. date of birth validation', () => {
  async function tryDob(page, dob) {
    await gotoParent(page);
    await fillParent(page, { ...MODELS.G50, dob });
    await page.locator('#pFinish').click();
  }

  const bad = 'תאריך הלידה לא נראה תקין. בדקו אותו שוב.';
  const age = 'השאלון מיועד לילדים בגילאי 3 עד 11. בדקו את תאריך הלידה.';

  for (const [name, dob, msg] of [
    ['future', '2027-01-01', bad],
    ['today', '2026-09-28', bad],
    ['before 1900', '1899-12-31', bad],
    ['under 3 (2 years 11 months)', '2023-10-28', age],
    ['exactly 12 today', '2014-09-28', age],
    ['over 12', '2010-05-05', age],
  ]) {
    test(`${name} is blocked, with the message next to the field`, async ({ page }) => {
      await tryDob(page, dob);
      await expect(page.locator('#pDone')).toBeHidden();
      await expect(page.locator('#pDobError')).toHaveText(msg);
      await expect(page.locator('#pDobField')).toHaveClass(/p-field-missing/);
      await expect(page.locator('#pMissing')).toContainText('תאריך לידה');
    });
  }

  for (const [name, dob] of [
    ['exactly 3 today', '2023-09-28'],
    ['11 years 364 days', '2014-09-29'],
    ['a normal date', '2021-02-28'],
  ]) {
    test(`${name} passes`, async ({ page }) => {
      await tryDob(page, dob);
      await expect(page.locator('#pDone')).toBeVisible();
    });
  }

  test('fixing the date clears the error and the message', async ({ page }) => {
    await tryDob(page, '2027-01-01');
    await setDob(page, '2021-02-28');
    await expect(page.locator('#pDobError')).toBeHidden();
    await expect(page.locator('#pMissing')).toBeHidden();
    await page.locator('#pFinish').click();
    await expect(page.locator('#pDone')).toBeVisible();
  });
});

test.describe('3-5. the missing message', () => {
  test('only sex+date missing: fields marked, message right under the details card, in view', async ({
    page,
  }) => {
    await gotoParent(page);
    for (let n = 1; n <= 30; n++) await page.locator(`label[for="pq${n}_3"]`).click();
    await page.locator('#pFinish').click();
    await expect(page.locator('#pSexField')).toHaveClass(/p-field-missing/);
    await expect(page.locator('#pDobField')).toHaveClass(/p-field-missing/);
    await expect(page.locator('#pMissing')).toBeVisible();
    const adjacent = await page.evaluate(
      () => document.getElementById('pDetails').nextElementSibling.id,
    );
    expect(adjacent).toBe('pMissing');
    await expect(page.locator('#pMissing')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#pSexField')).toBeInViewport();
  });

  test('grammar: one item vs several; stays in step with every change', async ({ page }) => {
    await gotoParent(page);
    await page.locator('label[for="pSex_m"]').click();
    await setDob(page, '2021-02-28');
    for (let n = 1; n <= 30; n++) {
      if (n === 5 || n === 17) continue;
      await page.locator(`label[for="pq${n}_2"]`).click();
    }
    await page.locator('#pFinish').click();
    await expect(page.locator('#pMissing')).toContainText('תשובות לשאלות 5, 17');

    await page.locator('label[for="pq5_2"]').click();
    await expect(page.locator('#pMissing')).toContainText('תשובה לשאלה 17');
    await expect(page.locator('#pMissing')).not.toContainText('תשובות לשאלות');

    // a new problem appears after an edit: the message follows
    await setDob(page, '2027-01-01');
    await expect(page.locator('#pMissing')).toContainText('תאריך לידה');
    await setDob(page, '2021-02-28');
    await expect(page.locator('#pMissing')).not.toContainText('תאריך לידה');

    // a companion change also re-checks; answering the last item hides it
    await page.locator('#pWith_play .p-choice[data-value="mom"]').click();
    await expect(page.locator('#pMissing')).toBeVisible();
    await page.locator('label[for="pq17_2"]').click();
    await expect(page.locator('#pMissing')).toBeHidden();
  });

  test('hidden when the done screen opens and on "חזרה לתשובות"', async ({ page }) => {
    await gotoParent(page);
    await fillParent(page, MODELS.G50);
    await setDob(page, '');
    await page.locator('#pFinish').click();
    await expect(page.locator('#pMissing')).toBeVisible();
    await setDob(page, '2021-02-28');
    await expect(page.locator('#pMissing')).toBeHidden();
    await page.locator('#pFinish').click();
    await expect(page.locator('#pDone')).toBeVisible();
    await expect(page.locator('#pMissing')).toBeHidden();
    await page.locator('#pBack').click();
    await expect(page.locator('#pMissing')).toBeHidden();
  });
});

test('7. a failed PDF build retries loading jsPDF on the next tap', async ({ page }) => {
  await page.route('**/jspdf.umd.min.js', (route) => route.abort());
  await finish(page);
  await expect(page.locator('#pSendError')).toBeVisible();
  await page.unroute('**/jspdf.umd.min.js');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#pSend').click();
  const dl = await downloadPromise;
  expect(dl.suggestedFilename()).toBe('EFORTS-answers-2026-09-28-1000.pdf');
  await expect(page.locator('#pSendError')).toBeHidden();
});

test('7b. still blocked after the retry: the error message stays', async ({ page }) => {
  await page.route('**/jspdf.umd.min.js', (route) => route.abort());
  await finish(page);
  await expect(page.locator('#pSendError')).toBeVisible();
  await page.locator('#pSend').click();
  await expect(page.locator('#pSendError')).toBeVisible();
  await expect(page.locator('#pSendError')).toHaveText(
    'לא הצלחנו ליצור את הקובץ. רעננו את הדף ונסו שוב.',
  );
});

test('8. an undo that empties the form clears the saved draft', async ({ page }) => {
  await gotoParent(page);
  await page.locator('#pWith_play .p-choice[data-value="mom"]').click();
  expect(await page.evaluate(() => localStorage.getItem('eforts_parent_draft_v1'))).not.toBeNull();
  await page.locator('#pWith_play .p-choice[data-value="mom"]').click();
  expect(await page.evaluate(() => localStorage.getItem('eforts_parent_draft_v1'))).toBeNull();

  await setDob(page, '2021-02-28');
  expect(await page.evaluate(() => localStorage.getItem('eforts_parent_draft_v1'))).not.toBeNull();
  await setDob(page, '');
  expect(await page.evaluate(() => localStorage.getItem('eforts_parent_draft_v1'))).toBeNull();
});

test.describe('round 2 follow-ups', () => {
  test('N1. missing sex gets the orange side bar, not just a tint', async ({ page }) => {
    await gotoParent(page);
    await page.locator('#pFinish').click();
    const w = await page.evaluate(
      () => getComputedStyle(document.getElementById('pSexField')).borderInlineStartWidth,
    );
    expect(w).toBe('4px');
    const wd = await page.evaluate(
      () => getComputedStyle(document.getElementById('pDobField')).borderInlineStartWidth,
    );
    expect(wd).toBe('4px');
  });

  test('N2. no date error while the date is still being picked; live once complete', async ({
    page,
  }) => {
    await gotoParent(page);
    await page.locator('#pDobYear').selectOption('2020');
    await expect(page.locator('#pDobError')).toBeHidden();
    await page.locator('#pDobMonth').selectOption('2');
    await expect(page.locator('#pDobError')).toBeHidden();
    await expect(page.locator('#pDobField')).not.toHaveClass(/p-field-missing/);
    await page.locator('#pDobDay').selectOption('31');
    await expect(page.locator('#pDobError')).toHaveText('התאריך אינו קיים בלוח השנה.');
    await page.locator('#pDobDay').selectOption('28');
    await expect(page.locator('#pDobError')).toBeHidden();
  });

  test('N3. a filled but invalid date reads «תאריך לידה תקין» in the list', async ({ page }) => {
    await gotoParent(page);
    await setDob(page, '2027-01-01');
    await page.locator('#pFinish').click();
    await expect(page.locator('#pMissing')).toContainText('תאריך לידה תקין');
    await setDob(page, '');
    await expect(page.locator('#pMissing')).not.toContainText('תאריך לידה תקין');
    await expect(page.locator('#pMissing')).toContainText('תאריך לידה');
  });

  test('N4. the PDF says הילדה for a girl and הילד for a boy', async ({ page }) => {
    await gotoParent(page);
    const texts = await page.evaluate(
      ([g, b]) => [
        EFORTSPdf.bodyLines(g).map((l) => l.text),
        EFORTSPdf.bodyLines(b).map((l) => l.text),
      ],
      [MODELS.G50F, MODELS.G50],
    );
    expect(texts[0]).toContain('מי נמצא עם הילדה בדרך כלל:');
    expect(texts[0]).not.toContain('מי נמצא עם הילד בדרך כלל:');
    expect(texts[1]).toContain('מי נמצא עם הילד בדרך כלל:');
  });
});

test.describe('fix-all: date selects, restore scroll, companion size, file name', () => {
  test('1. three labelled selects in Hebrew order; no native date input', async ({ page }) => {
    await gotoParent(page);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('.p-dob-row select')].map((s) => [
        s.id,
        s.getAttribute('aria-label'),
        s.options[0].textContent,
      ]),
    );
    expect(order).toEqual([
      ['pDobDay', 'יום לידה', 'יום'],
      ['pDobMonth', 'חודש לידה', 'חודש'],
      ['pDobYear', 'שנת לידה', 'שנה'],
    ]);
    const months = await page.$$eval('#pDobMonth option', (o) => o.map((x) => x.textContent));
    expect(months.slice(1)).toEqual([
      'ינואר',
      'פברואר',
      'מרץ',
      'אפריל',
      'מאי',
      'יוני',
      'יולי',
      'אוגוסט',
      'ספטמבר',
      'אוקטובר',
      'נובמבר',
      'דצמבר',
    ]);
    const years = await page.$$eval('#pDobYear option', (o) => o.map((x) => x.value));
    expect(years[1]).toBe('2023');
    expect(years[years.length - 1]).toBe('2014');
    const days = await page.$$eval('#pDobDay option', (o) => o.length);
    expect(days).toBe(32);
  });

  test('1. swap-proof: day 3 / month 11 gives dob 2021-11-03, never 2021-03-11', async ({
    page,
  }) => {
    await gotoParent(page);
    await fillParent(page, { ...MODELS.G50, dob: '2021-11-03' });
    await page.locator('#pFinish').click();
    await expect(page.locator('#pDone')).toBeVisible();
    const code = await page.evaluate(() => state.code);
    expect(code).toContain('dob=2021-11-03|');
  });

  test('1. 31 February blocks «סיום» with the calendar message', async ({ page }) => {
    await gotoParent(page);
    await fillParent(page, { ...MODELS.G50, dob: '2021-02-28' });
    await page.locator('#pDobDay').selectOption('31');
    await expect(page.locator('#pDobError')).toHaveText('התאריך אינו קיים בלוח השנה.');
    await page.locator('#pFinish').click();
    await expect(page.locator('#pDone')).toBeHidden();
    await expect(page.locator('#pMissing')).toContainText('תאריך לידה תקין');
  });

  test('1. an old draft that stored an ISO date restores into the selects', async ({ page }) => {
    await gotoParent(page);
    await page.evaluate(() =>
      localStorage.setItem(
        'eforts_parent_draft_v1',
        JSON.stringify({
          v: 1,
          savedAt: Date.now(),
          sex: 'female',
          dob: '2019-07-05',
          with: { morning: '', play: '', social: '' },
          answers: { 1: 3 },
        }),
      ),
    );
    await gotoParent(page);
    expect(await getDob(page)).toBe('2019-7-5');
    await expect(page.locator('#pDobMonth option:checked')).toHaveText('יולי');
    // and a new save keeps ISO
    await page.locator('label[for="pq2_2"]').click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('eforts_parent_draft_v1')),
    );
    expect(saved.dob).toBe('2019-07-05');
  });

  test('2. a restored draft scrolls to the first unanswered item, below the progress bar', async ({
    page,
  }) => {
    await gotoParent(page);
    await page.locator('label[for="pSex_m"]').click();
    await setDob(page, '2021-02-28');
    for (let n = 1; n <= 12; n++) await page.locator(`label[for="pq${n}_3"]`).click();
    await gotoParent(page);
    await expect(page.locator('#pItem13')).toBeInViewport();
    const [top, bar] = await page.evaluate(() => [
      document.getElementById('pItem13').getBoundingClientRect().top,
      document.querySelector('.progress-wrap').getBoundingClientRect().bottom,
    ]);
    expect(top).toBeGreaterThanOrEqual(bar - 1);
  });

  test('2. a restored draft with sex/date missing lands on the details card', async ({ page }) => {
    await gotoParent(page);
    for (let n = 1; n <= 20; n++) await page.locator(`label[for="pq${n}_3"]`).click();
    await gotoParent(page);
    const top = await page.evaluate(
      () => document.getElementById('pDetails').getBoundingClientRect().top,
    );
    expect(top).toBeLessThan(200);
    expect(top).toBeGreaterThanOrEqual(0);
  });

  test('3. companion buttons are at least 44px tall on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await gotoParent(page);
    const hs = await page.$$eval('#pWith_morning .p-choice', (els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    expect(hs).toHaveLength(4);
    hs.forEach((h) => expect(h).toBeGreaterThanOrEqual(44));
  });

  test('4. the missing band starts at the top of the question', async ({ page }) => {
    await gotoParent(page);
    await page.locator('#pFinish').click();
    const [itemTop, legendTop] = await page.evaluate(() => [
      document.getElementById('pItem1').getBoundingClientRect().top,
      document.querySelector('#pItem1 legend').getBoundingClientRect().top,
    ]);
    expect(legendTop).toBeGreaterThanOrEqual(itemTop);
  });

  test('6. the PDF name carries the fill date and the local time', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-28T14:07:00+03:00'));
    await finish(page);
    const dl = page.waitForEvent('download');
    await page.locator('#pSend').click();
    expect((await dl).suggestedFilename()).toBe('EFORTS-answers-2026-09-28-1407.pdf');
  });
});
