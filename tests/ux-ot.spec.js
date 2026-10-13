// UX round, OT page (O1-O12 of the 2026-10-11 UX review): the import preview
// that fills AND calculates, copy to Clicks, the compact score table, the
// action order, the parent card, the reopen bar, the dot order, print titles.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');
const { MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

const NOW = new Date('2026-10-11T10:00:00+03:00');

const SCORES = {};
for (let i = 1; i <= 30; i++) SCORES[i] = (i % 5) + 1;

async function open(page) {
  await page.clock.setFixedTime(NOW);
  await gotoApp(page);
}

async function previewG50(page) {
  const code = await page.evaluate((m) => EFORTSCode.encode(m), MODELS.G50);
  await page.locator('#importCode').fill(code);
  await page.locator('#importCodeBtn').click();
  await expect(page.locator('#importPreview')).toBeVisible();
}

async function results(page, anonId = '31') {
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: SCORES,
    anonId,
  });
  await expect(page.locator('#results')).toBeVisible();
}

// ===== O1 =====
test('O1: the preview has the number field and one button that fills and calculates', async ({
  page,
}) => {
  await open(page);
  await previewG50(page);
  await expect(page.locator('#importApply')).toHaveText('מילוי וחישוב ציונים');
  await expect(page.locator('#importCancel')).toBeVisible();
  const order = await page.evaluate(() => {
    const y = (id) => document.getElementById(id).getBoundingClientRect().top;
    return y('importAnon') < y('importApply');
  });
  expect(order).toBe(true);

  await page.locator('#importAnon').fill('42');
  await page.locator('#importApply').click();
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('.results-meta')).toContainText("מס' 42");
  expect(await page.locator('#anonId').inputValue()).toBe('42');
  // lands on the results title, not the page top
  await expect(page.locator('#resultsTitle')).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(60);
});

test('O1: an empty number is marked and focused, and nothing is filled', async ({ page }) => {
  await open(page);
  await previewG50(page);
  await page.locator('#importApply').click();
  await expect(page.locator('#importAnon')).toBeFocused();
  await expect(page.locator('#importAnon')).toHaveClass(/field-invalid/);
  await expect(page.locator('#importAnonMsg')).toContainText('יש להזין מספר אנונימי');
  await expect(page.locator('#results')).toBeHidden();
  expect(await page.locator('#questionnaire input:checked').count()).toBe(0);
  expect(await page.locator('#childGender').inputValue()).toBe('');
  // a spaces-only number is empty too
  await page.locator('#importAnon').fill('   ');
  await page.locator('#importApply').click();
  await expect(page.locator('#results')).toBeHidden();
});

test('O1: after an import the 30 answers fold into one line, and expand to edit', async ({
  page,
}) => {
  await open(page);
  await previewG50(page);
  await page.locator('#importAnon').fill('42');
  await page.locator('#importApply').click();
  await page.locator('button:text-is("חזרה לשאלון")').click();
  const fold = page.locator('#foldToggle');
  await expect(fold).toBeVisible();
  await expect(fold).toContainText('30 תשובות מולאו מהקובץ');
  await fold.click(); // folds
  await expect(fold).toContainText('הצגה ועריכה');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#questionnaire')).toBeHidden();
  await fold.click();
  await expect(page.locator('#questionnaire')).toBeVisible();
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
});

test('O1: manual entry shows the items as before; «חשב ציונים» is under the details too', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('#foldToggle')).toBeHidden();
  await expect(page.locator('#questionnaire')).toBeVisible();
  const order = await page.evaluate(() => {
    const y = (id) => document.getElementById(id).getBoundingClientRect().top;
    return y('anonId') < y('calcTop') && y('calcTop') < y('questionnaire');
  });
  expect(order).toBe(true);
  await expect(page.locator('#calcTop')).toHaveText('חשב ציונים');
});

// ===== O2 =====
test('O2: «העתקה לקליקס» copies the Clicks text, says so, and clears after 5 s', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await results(page);
  await expect(page.locator('#copyClicks')).toHaveText('העתקה לקליקס');
  await expect(page.locator('#copyClicks')).toHaveClass(/btn-primary/);
  await page.locator('#copyClicks').click();
  await expect(page.locator('#clicksStatus')).toHaveText('הועתק ✓ — אפשר להדביק בקליקס');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const expected = await page.evaluate(() => buildClicksText());
  expect(clip.replace(/\r\n/g, '\n').trim()).toBe(expected.trim());
  await page.clock.fastForward(5200);
  await expect(page.locator('#clicksStatus')).toHaveText('');
});

test('O2: without the clipboard API the copy falls back to execCommand', async ({ page }) => {
  await open(page);
  await results(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    window.__copied = null;
    document.execCommand = (cmd) => {
      window.__copied = document.activeElement && document.activeElement.value;
      return cmd === 'copy';
    };
  });
  await page.locator('#copyClicks').click();
  await expect(page.locator('#clicksStatus')).toHaveText('הועתק ✓ — אפשר להדביק בקליקס');
  expect(await page.evaluate(() => window.__copied)).toContain('תמונה כללית');
});

test('O2: the .txt download stays as a small link under the copy button', async ({ page }) => {
  await open(page);
  await results(page);
  const link = page.locator('.summary-card .btn-clicks');
  await expect(link).toHaveText('או: הורדה כקובץ טקסט (Notepad)');
  const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(dl.suggestedFilename()).toMatch(/_clicks\.txt$/);
  const y = await page.evaluate(() => [
    document.getElementById('copyClicks').getBoundingClientRect().bottom,
    document.querySelector('.summary-card .btn-clicks').getBoundingClientRect().top,
  ]);
  expect(y[1]).toBeGreaterThan(y[0]);
});

// ===== O3 =====
test('O3: the scores are a compact table; every row still opens, by click and by keyboard', async ({
  page,
}) => {
  await open(page);
  await results(page);
  await expect(page.locator('.score-head').first()).toContainText('שגרה');
  await expect(page.locator('.score-head').first()).toContainText('ציון החתך');
  await expect(page.locator('.score-head').last()).toContainText('תפקוד ניהולי');
  await expect(page.locator('.score-head').last()).toContainText('מצב');
  expect(await page.locator('.score-row').count()).toBe(7);
  // a row is a short grid line: label | score | cutoff | status
  const h = await page.locator('.score-row[data-drill="morning"]').boundingBox();
  expect(h.height).toBeLessThan(70);

  const row = page.locator('.score-row[data-drill="morning"]');
  await row.click();
  await expect(page.locator('#drill_morning')).toBeVisible();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await row.click();
  await expect(page.locator('#drill_morning')).toBeHidden();

  const kb = page.locator('.score-row[data-drill="inh"]');
  await kb.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#drill_inh')).toBeVisible();
  await page.keyboard.press(' ');
  await expect(page.locator('#drill_inh')).toBeHidden();
});

test('O3: «חשב ציונים» lands on the results title; the credits header is gone from the results', async ({
  page,
}) => {
  await open(page);
  await results(page);
  await expect(page.locator('#resultsTitle')).toBeInViewport();
  await expect(page.locator('.header')).toBeHidden();
  await expect(page.locator('#progressWrap')).toBeHidden();
});

// ===== O4 / O5 / O6 =====
test('O4: the result actions are in the decided order', async ({ page }) => {
  await open(page);
  await results(page);
  const ys = await page.evaluate(() => {
    const y = (sel) => document.querySelector(sel).getBoundingClientRect().top;
    return [
      y('#copyClicks'),
      y('.btn-pdf'),
      y('#printHint'),
      y('.parent-box'),
      y('.link-row .btn-ai'),
      y('.link-row .btn-back'),
      y('.btn-new'),
    ];
  });
  for (let i = 1; i < ys.length; i++) {
    if (i === 5)
      expect(Math.abs(ys[i] - ys[i - 1])).toBeLessThan(4); // the two links share a line
    else expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  }
  await expect(page.locator('.btn-pdf')).toHaveText('PDF למטפל/ת');
  await expect(page.locator('#printHint')).toHaveText('ייפתח חלון הדפסה — בחר/י "שמירה כ-PDF".');
  await expect(page.locator('.btn-new')).toHaveText('שאלון חדש — לילד/ה הבא/ה');
  // grey, full width, not the pink danger button
  const style = await page.locator('.btn-new').evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      bg: cs.backgroundColor,
      w: el.getBoundingClientRect().width,
      pw: el.parentNode.getBoundingClientRect().width,
    };
  });
  expect(style.bg).toBe('rgb(226, 232, 240)');
  expect(Math.round(style.w)).toBe(Math.round(style.pw));
});

test('O5: one card «דף להורים» holds the note, the PDF button and the hint', async ({ page }) => {
  await open(page);
  await results(page);
  const card = page.locator('.parent-box');
  await expect(card.locator('.parent-box-title')).toHaveText('דף להורים');
  await expect(card.locator('label[for="parentNote"]')).toHaveText(
    'הערה אישית (לא חובה) — תופיע בדף להורים',
  );
  await expect(card.locator('#parentNote')).toBeVisible();
  await expect(card.locator('.btn-parent-pdf')).toHaveText('PDF להורים');
  await expect(card.locator('.parent-box-hint')).toHaveText(
    'מומלץ למסור להורים בפגישה או מיד אחריה.',
  );
});

test('O6: the AI instructions are a small collapsible box «מה עושים עם הקובץ?»', async ({
  page,
}) => {
  await open(page);
  await results(page);
  const help = page.locator('.ai-help');
  await expect(help.locator('summary')).toHaveText('מה עושים עם קובץ ה-AI?');
  expect(await help.evaluate((el) => el.open)).toBe(false);
  await help.locator('summary').click();
  await expect(help).toContainText('הכלי יכתוב רק את פסקת המטפל/ת');
  // it sits under the AI link, not inside the summary card
  expect(await page.locator('.summary-card .ai-help').count()).toBe(0);
});

// ===== O7 =====
test('O7: the summary reads at 16px in the main text colour', async ({ page }) => {
  await open(page);
  await results(page);
  const css = await page.locator('.summary-text').evaluate((el) => {
    const cs = window.getComputedStyle(el);
    const main = window.getComputedStyle(document.body).color;
    return { size: cs.fontSize, same: cs.color === main };
  });
  expect(css.size).toBe('16px');
  expect(css.same).toBe(true);
});

// ===== O8 =====
test('O8: the credit line stays visible at the top; the progress bar starts at the questionnaire', async ({
  page,
}) => {
  await open(page);
  await expect(page.locator('.header-credit')).toBeVisible();
  await expect(page.locator('.header-authors')).toBeVisible();
  const y = await page.evaluate(() => ({
    bar: document.getElementById('progressWrap').getBoundingClientRect().top + window.scrollY,
    q: document.getElementById('questionnaire').getBoundingClientRect().top + window.scrollY,
    send: document.getElementById('sendBox').getBoundingClientRect().top + window.scrollY,
  }));
  expect(y.bar).toBeGreaterThan(y.send);
  expect(y.bar).toBeLessThan(y.q);
  // scrolled to the top of the page the bar is not stuck over the send box
  expect(
    await page.evaluate(() => document.getElementById('progressWrap').getBoundingClientRect().top),
  ).toBeGreaterThan(200);
});

// ===== O9 =====
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

test('O9: a complete saved form offers «הצגת התוצאות» next to «שאלון חדש»', async ({ page }) => {
  await open(page);
  await seedAndReload(page, savedForm());
  await expect(page.locator('#restoreBar')).toBeVisible();
  await expect(page.locator('#restoreShow')).toHaveText('הצגת התוצאות');
  await expect(page.locator('#restoreNew')).toHaveText('שאלון חדש');
  await page.locator('#restoreShow').click();
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('.results-meta')).toContainText("מס' 77");
});

test('O9: an incomplete saved form has no «הצגת התוצאות»', async ({ page }) => {
  await open(page);
  const answers = { 1: 3, 2: 3 };
  await seedAndReload(page, savedForm({ answers }));
  await expect(page.locator('#restoreBar')).toBeVisible();
  await expect(page.locator('#restoreShow')).toBeHidden();
});

test('O9: a refresh opens at the top', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.reload();
  await page.waitForSelector('#questionnaire .item-row');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
  expect(await page.evaluate(() => window.history.scrollRestoration)).toBe('manual');
});

// ===== O10 =====
test('O10: the missing-number warning goes to the number field', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    document.getElementById('childGender').value = 'male';
    document.getElementById('birthDay').value = '15';
    document.getElementById('birthMonth').value = '2';
    document.getElementById('birthYear').value = '2020';
    updateAge();
    calculate();
  });
  await expect(page.locator('#anonId')).toBeFocused();
  await expect(page.locator('#anonId')).toHaveClass(/field-invalid/);
  const under = await page.evaluate(() => {
    const f = document.getElementById('anonId').getBoundingClientRect();
    const w = document.getElementById('warning').getBoundingClientRect();
    return w.top >= f.bottom - 1;
  });
  expect(under).toBe(true);
});

test('O10: missing answers go to the first missing item', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    document.getElementById('anonId').value = '5';
    document.getElementById('childGender').value = 'male';
    document.getElementById('birthDay').value = '15';
    document.getElementById('birthMonth').value = '2';
    document.getElementById('birthYear').value = '2020';
    updateAge();
    document.getElementById('q1_3').checked = true;
    calculate();
  });
  await expect(page.locator('#warning')).toContainText('חסרות תשובות לפריטים: 2');
  await expect(page.locator('#q2_1')).toBeFocused();
});

// ===== O11 =====
test('O11: score dots run right-to-left, 1 on the right', async ({ page }) => {
  await open(page);
  await results(page);
  await page.locator('.score-row[data-drill="morning"]').click();
  const xs = await page
    .locator('#drill_morning .drill-item')
    .first()
    .locator('.drill-dot')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
  expect(xs.length).toBe(5);
  for (let i = 1; i < 5; i++) expect(xs[i]).toBeLessThan(xs[i - 1]);
});

test('O11: date selects are day / month / year from the right; the 1-5 legend row is gone', async ({
  page,
}) => {
  await open(page);
  for (const pre of ['birth', 'fill']) {
    const xs = await page.evaluate(
      (p) =>
        ['Day', 'Month', 'Year'].map(
          (k) => document.getElementById(p + k).getBoundingClientRect().left,
        ),
      pre,
    );
    expect(xs[0]).toBeGreaterThan(xs[1]);
    expect(xs[1]).toBeGreaterThan(xs[2]);
  }
  expect(await page.locator('.scale-legend').count()).toBe(0);
});

test('O11: sex reads «בן» / «בת» on the form and in the results header', async ({ page }) => {
  await open(page);
  const opts = await page.locator('#childGender option').allTextContents();
  expect(opts.map((o) => o.trim())).toEqual(['—', 'בן', 'בת']);
  expect(await page.locator('#childGender option[value="male"]').count()).toBe(1);
  await results(page);
  await expect(page.locator('.results-meta')).toContainText('| בן |');
  // the summary text keeps its own wording
  const summary = await page.locator('.summary-text').innerText();
  expect(summary).toBeTruthy();
});

// ===== O12 =====
async function printTitle(page, buttonSel) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click(buttonSel)]);
  await popup.waitForLoadState('domcontentloaded');
  return { popup, title: await popup.title() };
}

test('O12: the OT PDF title is EFORTS_<number>_<fill date>_למטפל', async ({ page }) => {
  await open(page);
  await results(page, '31');
  const { title } = await printTitle(page, '.btn-pdf');
  expect(title).toBe('EFORTS_31_2026-10-15_למטפל');
});

test('O12: the parent sheet title starts with «סיכום התוצאות להורים»', async ({ page }) => {
  await open(page);
  await results(page, '31');
  const { title } = await printTitle(page, '.btn-parent-pdf');
  expect(title).toBe('סיכום התוצאות להורים — EFORTS 15/10/2026');
  // F3 detection (the app's own parent sheet) still finds the phrase
  const found = await page.evaluate(() => {
    const phrase = 'סיכום התוצאות להורים';
    let hex = '';
    for (const ch of phrase) hex += ch.charCodeAt(0).toString(16).padStart(4, '0');
    return window.pdfIsParentSheet('x' + hex + 'y');
  });
  expect(found).toBe(true);
});

test('O12: no «שמור» button; a small autosave note instead', async ({ page }) => {
  await open(page);
  expect(await page.locator('button:text-is("שמור")').count()).toBe(0);
  await expect(page.locator('#saveIndicator')).toBeVisible();
  await expect(page.locator('#saveIndicator')).toHaveText('נשמר זמנית בלשונית זו בלבד, עד לסגירתה');
});

test('O12: a read file says «הקובץ נקרא», pasted code keeps «נמצא קוד תקין»', async ({ page }) => {
  await open(page);
  await previewG50(page);
  await expect(page.locator('#importPreviewTitle')).toHaveText(
    'נמצא קוד תקין. בדוק/י לפני המילוי:',
  );
  const code = await page.evaluate((m) => EFORTSCode.encode(m), MODELS.G50);
  const tmp = require('path').join(require('os').tmpdir(), 'eforts-answers-ux.txt');
  fs.writeFileSync(tmp, code);
  await page.setInputFiles('#importFile', tmp);
  await expect(page.locator('#importPreviewTitle')).toHaveText('הקובץ נקרא. בדוק/י לפני המילוי:');
});
