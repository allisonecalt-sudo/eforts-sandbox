// Locks every one of the 30 items to the routine scale + EF scale the app
// CURRENTLY assigns it (read from the live `items` array via page.evaluate,
// not a hand-copied constant — see tests/helpers/eforts-app.js for why that
// matters). Sourced against evidence-dossier-2026-09-28.md §B/§D.

const { test, expect } = require('@playwright/test');
const { gotoApp, getItemsAndCutoffs } = require('./helpers/eforts-app');

// Routine groupings — dossier §B/§D: morning 1-16, play 17-23, social 24-30.
// Matches the paper AND the Excel AND the app (dossier §D comparison table).
const EXPECTED_ROUTINE = {};
for (let n = 1; n <= 16; n++) EXPECTED_ROUTINE[n] = 'morning';
for (let n = 17; n <= 23; n++) EXPECTED_ROUTINE[n] = 'play';
for (let n = 24; n <= 30; n++) EXPECTED_ROUTINE[n] = 'social';

// EF scale assignment — dossier §D "What the app implements" +
// §D comparison table. This is the app's CURRENT behavior: items 10 & 11
// are excluded from all EF scales (ef: null), matching the authors' Excel
// column-C "לא כלול" label — NOT the paper's own Table 3, which counts 14
// WM items (including 10, 11). Both are internally consistent; they answer
// different questions (factor loading vs. clinical scoring protocol).
// See dossier §D/§E/§H item 7 — decision pending with the authors
// (PLAN-2026-09-28 Q8). This test locks the app's CURRENT choice; it does
// NOT assert that choice is the "right" one.
const EXPECTED_EF = {
  // Inhibition (8): matches paper AND Excel's own column labels exactly.
  6: 'inh',
  8: 'inh',
  14: 'inh',
  16: 'inh',
  23: 'inh',
  26: 'inh',
  29: 'inh',
  30: 'inh',
  // Working memory (12, excludes 10 & 11): matches Excel's clinical
  // scoring protocol; diverges from the paper's 14-item factor-analysis
  // count.
  1: 'wm',
  2: 'wm',
  3: 'wm',
  4: 'wm',
  7: 'wm',
  9: 'wm',
  12: 'wm',
  18: 'wm',
  19: 'wm',
  20: 'wm',
  25: 'wm',
  27: 'wm',
  // Flexibility (8): matches paper and Excel exactly.
  5: 'flex',
  13: 'flex',
  15: 'flex',
  17: 'flex',
  21: 'flex',
  22: 'flex',
  24: 'flex',
  28: 'flex',
  // Excluded from all EF scales — matches the authors' Excel diverges
  // from the paper's Table 3, decision pending with the authors, see
  // PLAN-2026-09-28 Q8.
  10: null,
  11: null,
};

test('every item maps to the routine + EF scale the app currently assigns it', async ({ page }) => {
  await gotoApp(page);
  const { items } = await getItemsAndCutoffs(page);

  expect(items).toHaveLength(30);

  const byNum = {};
  items.forEach((i) => (byNum[i.num] = i));

  for (let num = 1; num <= 30; num++) {
    expect(byNum[num], `item ${num} should exist`).toBeDefined();
    expect(byNum[num].routine, `item ${num} routine`).toBe(EXPECTED_ROUTINE[num]);
    expect(byNum[num].ef, `item ${num} EF scale`).toBe(EXPECTED_EF[num]);
  }
});

test('routine groupings sum to 16 / 7 / 7 = 30', async ({ page }) => {
  await gotoApp(page);
  const { items } = await getItemsAndCutoffs(page);

  const morning = items.filter((i) => i.routine === 'morning');
  const play = items.filter((i) => i.routine === 'play');
  const social = items.filter((i) => i.routine === 'social');

  expect(morning).toHaveLength(16);
  expect(play).toHaveLength(7);
  expect(social).toHaveLength(7);
});

test('EF scales sum to 8 / 12 / 8, plus 2 excluded = 30', async ({ page }) => {
  await gotoApp(page);
  const { items } = await getItemsAndCutoffs(page);

  const inh = items.filter((i) => i.ef === 'inh');
  const wm = items.filter((i) => i.ef === 'wm');
  const flex = items.filter((i) => i.ef === 'flex');
  const excluded = items.filter((i) => i.ef === null);

  expect(inh).toHaveLength(8);
  expect(wm).toHaveLength(12);
  expect(flex).toHaveLength(8);
  expect(excluded).toHaveLength(2);
  expect(excluded.map((i) => i.num).sort()).toEqual([10, 11]);
});
