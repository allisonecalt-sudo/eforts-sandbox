// B8 FIXED by TM-spec 2026-09-28 §B: every score row takes its word AND its
// color from cutoffStatus(). A below-cutoff play score (3.43 < 3.55, band
// 8-11) must be red in value, gauge and pill, say "נמוך מציון החתך", and
// carry no reassuring or absolute-band label anywhere in its row.
const { test, expect } = require('@playwright/test');
const { gotoApp, fillAndCalculate, extractRowSignals } = require('./helpers/eforts-app');

function buildItemScores() {
  const scores = {};
  for (let n = 1; n <= 16; n++) scores[n] = 3;
  Object.assign(scores, { 17: 3, 18: 3, 19: 4, 20: 3, 21: 4, 22: 4, 23: 3 }); // play sum 24 -> 3.43
  for (let n = 24; n <= 30; n++) scores[n] = 3;
  return scores;
}

test('B8: a below-cutoff play score carries one status, no reassuring label (8-11)', async ({
  page,
}) => {
  await gotoApp(page);
  const html = await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 9,
    ageMonthsBack: 0,
    itemScores: buildItemScores(),
    anonId: 'b8-repro',
  });
  const row = extractRowSignals(html, 'play');
  expect(row.score).toBe('3.43');
  expect(row.valueCls).toBe('warn');
  expect(row.gaugeCls).toBe('warn');
  expect(row.statusCls).toBe('warn');
  expect(row.statusText).toBe('נמוך מציון החתך');
  expect(row.rowHtml).not.toMatch(/בטווח הממוצע|בטווח התקין|בטווח הנורמה|מתחת לממוצע|קושי משמעותי/);
});
