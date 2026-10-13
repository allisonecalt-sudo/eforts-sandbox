// Locks TM-spec 2026-09-28: (1) the EF "close" status, (2) retired UI terms
// never return on any surface the app writes itself (the summary is
// excluded: it follows the canon and the goldens lock it), (3) the AI export
// carries the fixed summary, 2-decimal cutoffs, the right instrument name
// and the clinician-slot prompt.
const { test, expect } = require('@playwright/test');
const { gotoApp, fillAndCalculate, extractRowSignals } = require('./helpers/eforts-app');

// Regexes, not strings: the cutoff definition legitimately says "1.5 סטיות
// תקן מתחת לממוצע", so only the old STATUS use of "מתחת לממוצע" is retired.
const RETIRED = [
  /בטווח התקין/,
  /(?<!סטיות תקן )מתחת לממוצע/,
  /בטווח הממוצע/,
  /קושי משמעותי/,
  /מתחת לחתך/,
  /מתחת לציון החתך/,
  /סולמות ניהוליים/,
  /סולמות תפקודים/,
  /חשד לעיכוב/,
  /Tool for Screening/,
  /ממלא:/,
];

function allThrees() {
  const s = {};
  for (let n = 1; n <= 30; n++) s[n] = 3;
  return s;
}

async function runAllThrees(page) {
  await gotoApp(page);
  // age 4y0m -> band 3-5: WM 3.00 vs cutoff 3.00 (close), play 3.00 vs 3.14 (below)
  return fillAndCalculate(page, {
    sex: 'female',
    ageYearsBack: 4,
    ageMonthsBack: 0,
    itemScores: allThrees(),
    anonId: '77',
  });
}

test('EF close status: WM at its cutoff is amber "קרוב לציון החתך"', async ({ page }) => {
  const html = await runAllThrees(page);
  const wm = extractRowSignals(html, 'wm');
  expect(wm.statusText).toBe('קרוב לציון החתך');
  expect([wm.valueCls, wm.gaugeCls, wm.statusCls]).toEqual(['mid', 'mid', 'mid']);
  const inh = extractRowSignals(html, 'inh');
  expect(inh.statusText).toBe('בטווח הנורמה');
  const play = extractRowSignals(html, 'play');
  expect(play.statusText).toBe('נמוך מציון החתך');
});

test('no retired term on the results screen outside the summary', async ({ page }) => {
  await runAllThrees(page);
  const nonSummary = await page.evaluate(() => {
    const clone = document.getElementById('results').cloneNode(true);
    clone.querySelectorAll('.summary-text').forEach((el) => el.remove());
    return clone.innerHTML;
  });
  for (const re of RETIRED) expect(nonSummary, String(re)).not.toMatch(re);
});

test('AI export: fixed summary, 2-decimal cutoffs, clinician-slot prompt', async ({ page }) => {
  await runAllThrees(page);
  const text = await page.evaluate(() => buildExportText());
  const head = text.split('הסיכום הקליני שנכתב בכלי')[0];
  for (const re of RETIRED) expect(head, String(re)).not.toMatch(re);
  expect(text).toContain('Executive Functions & Occupational Routine Scale');
  expect(text).toContain('ציון החתך: 3.00');
  expect(text).toContain('קרוב לציון החתך');
  expect(text).toContain('מספר אנונימי: 77');
  // the number stays in the details line only; the AI prompt says pronoun only
  expect(text.split('מספר אנונימי: 77').length).toBe(2);
  expect(text.match(/77/g).length).toBe(1);
  expect(text).toContain('אין מספר, שם או ת״ז; רק כינוי גוף.');
  expect(text).not.toContain('המספר האנונימי מופיע');
  expect(text).toContain('תמונה כללית');
  expect(text).toContain('אם מצרפים ממצאי הערכה אלו לתמונה הקלינית בשטח עולה כי');
  expect(text).toContain('אל תחשב מחדש אף ציון');
});
