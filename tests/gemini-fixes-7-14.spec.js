// Gemini Pro code review, 2026-09-28 (second-brain/projects/clalit/eforts/
// GEMINI-REVIEW-2026-09-28.md, "FIX LIST FOR THE BUILDER" items 7-10, 13).
// Covers the two logic bugs the review found (a stale age band after a
// date edit, and an unescaped anonId at every HTML sink) plus the display
// fixes the list asked to have tests for.

const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  setAgeEdge,
  fillAndCalculate,
  extractRowSignals,
} = require('./helpers/eforts-app');

function allThrees() {
  const s = {};
  for (let n = 1; n <= 30; n++) s[n] = 3;
  return s;
}

function allTwos() {
  const s = {};
  for (let n = 1; n <= 30; n++) s[n] = 2;
  return s;
}

// ===== Item 7: stale age band after a date edit =====

test('item 7: clearing the fill date after entry blocks calculate() with a warning, no stale results', async ({
  page,
}) => {
  await gotoApp(page);
  await setAgeEdge(page, 5, 0); // valid age, band 3-5
  await page.evaluate(() => {
    document.getElementById('anonId').value = 'stale-band';
    document.getElementById('childGender').value = 'male';
  });

  // Clear the fill day post-entry -> updateAge()'s early return must wipe
  // the previously-computed age/band, not leave it sitting stale.
  await page.evaluate(() => {
    document.getElementById('fillDay').value = '';
    updateAge();
  });
  expect(await page.locator('#ageGroup').inputValue()).toBe('');
  expect(await page.locator('#calcAge').textContent()).toBe('—');
  expect(await page.locator('#ageGroupDisplay').textContent()).toBe('—');

  await page.click('button:has-text("חשב ציונים")');
  await expect(page.locator('#warning')).toBeVisible();
  // UX2-8: every empty field is named at once (the items are empty here too)
  await expect(page.locator('#warning')).toContainText('תאריך מילוי');
  await expect(page.locator('#results')).toBeHidden();
});

test('item 7: changing the birth date after results were shown updates the band + cutoffs on recalculation', async ({
  page,
}) => {
  await gotoApp(page);

  // First pass: age 4y0m -> band 3-5. All-3s makes WM (cutoff 3.00) read
  // "close", not "below".
  await setAgeEdge(page, 4, 0);
  const html1 = await page.evaluate(() => {
    document.getElementById('anonId').value = 'band-switch';
    document.getElementById('childGender').value = 'male';
    items.forEach((it) => {
      const radio = document.getElementById(`q${it.num}_3`);
      if (radio) radio.checked = true;
    });
    calculate();
    return document.getElementById('results').innerHTML;
  });
  const wm1 = extractRowSignals(html1, 'wm');
  expect(wm1.statusText).toBe('קרוב לציון החתך');
  expect(wm1.statusCls).toBe('mid');

  // Edit the birth date (results still showing, form hidden but its
  // fields still live) so the child is now 9y0m -> band 8-11, where WM's
  // cutoff (3.37) puts the same all-3s score clearly below it.
  await setAgeEdge(page, 9, 0);
  const html2 = await page.evaluate(() => {
    calculate();
    return document.getElementById('results').innerHTML;
  });
  expect(html2).toContain('8.0 — 11.11');
  const wm2 = extractRowSignals(html2, 'wm');
  expect(wm2.statusText).toBe('נמוך מציון החתך');
  expect(wm2.statusCls).toBe('warn');
});

// ===== Item 8: escapeHtml =====

test('item 8: an anonId with HTML renders literally in results + summary; the export filename has no "<"', async ({
  page,
}) => {
  await gotoApp(page);
  // FX2 (Gemini review item 2) replaced the one place the two-below-EF
  // routine clause embedded anonId mid-sentence ("בכך ש-${anonId}") with a
  // pronoun — so all-2s no longer puts anonId inside buildSummary()'s own
  // output. (Since 2026-10-09 even the מומלץ paragraph's motivation clause
  // uses a possessive, not the number.) That clause only renders when >=2 items score
  // 4-5 (FX2 spec §C), so two items are bumped to 4 to reach it.
  const html = await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 5,
    ageMonthsBack: 0,
    itemScores: { ...allTwos(), 17: 4, 22: 4 },
    anonId: '<b>x</b>',
  });

  expect(html).not.toContain('<b>x</b>');
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');

  const summaryHtml = await page.locator('.summary-text').innerHTML();
  // her ruling 2026-10-09: the number is not written inside summary sentences
  expect(summaryHtml).not.toContain('<b>x</b>');
  expect(summaryHtml).not.toContain('&lt;b&gt;x&lt;/b&gt;');
  expect(summaryHtml).toContain('גיוס המוטיבציה שלו');

  const downloadPromise = page.waitForEvent('download');
  await page.click('.btn-ai');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).not.toContain('<');
  expect(download.suggestedFilename()).not.toContain('>');
  // named by the questionnaire's fill date, not today's
  const fillIso = await page.evaluate(() => getFillDateValue());
  expect(download.suggestedFilename()).toBe(`EFORTS__b_x__b__${fillIso}_AI.txt`);
});

// ===== Item 9: fmtScore =====

test('item 9: a below-cutoff score that rounds to the cutoff shows a 3rd decimal', async ({
  page,
}) => {
  await gotoApp(page);
  const result = await page.evaluate(() => ({
    collision: fmtScore(2.915, 2.92),
    belowNoCollision: fmtScore(2.5, 2.92),
    atCutoff: fmtScore(2.92, 2.92),
    aboveCutoff: fmtScore(3.0, 2.92),
  }));
  expect(result.collision).toBe('2.915');
  expect(result.belowNoCollision).toBe('2.50');
  expect(result.atCutoff).toBe('2.92');
  expect(result.aboveCutoff).toBe('3.00');
});

// ===== Item 10: print popup blocked =====

test('item 10: a blocked print popup shows a Hebrew warning and restores the button', async ({
  page,
}) => {
  await gotoApp(page);
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 5,
    ageMonthsBack: 0,
    itemScores: allThrees(),
    anonId: 'popup-blocked',
  });

  await page.evaluate(() => {
    window.open = () => null;
  });

  let dialogMessage = '';
  page.once('dialog', async (d) => {
    dialogMessage = d.message();
    await d.accept();
  });
  await page.click('.btn-pdf');

  await expect(page.locator('.btn-pdf')).toBeEnabled();
  await expect(page.locator('.btn-pdf')).toHaveText('PDF למטפל/ת');
  expect(dialogMessage).toContain('חלונות קופצים');
});

// ===== Item 13: progress bar hidden on results =====

test('item 13: the progress bar hides on results and returns on "חזרה לשאלון"', async ({
  page,
}) => {
  await gotoApp(page);
  await expect(page.locator('#progressWrap')).toBeVisible();

  await fillAndCalculate(page, {
    sex: 'female',
    ageYearsBack: 5,
    ageMonthsBack: 0,
    itemScores: allThrees(),
    anonId: 'progress-hide',
  });
  await expect(page.locator('#progressWrap')).toBeHidden();

  await page.click('button:has-text("חזרה לשאלון")');
  await expect(page.locator('#progressWrap')).toBeVisible();
});
