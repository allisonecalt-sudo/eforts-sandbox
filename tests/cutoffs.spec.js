// Locks all 21 cutoff values (7 scales x 3 age bands) the app holds, read
// from the live `cutoffs` object (not a hand-copied constant). Sourced
// against evidence-dossier-2026-09-28.md §B (Table 5 for routines, Table 4
// M-1.5SD derivation for EF scales) and cross-verified there by
// verify_vs_paper.py (all MATCH=True, dossier §D "Cutoff tables").
//
// Routine cutoffs (morning/play/social/total) are quoted directly from the
// paper's own Table 5 — no ambiguity.
//
// EF cutoffs (inh/wm/flex) are the M-1.5SD rule applied to the paper's
// Table 4 raw M/SD — dossier §B/§H item 6 flags that the paper's own text
// never states this rule applies to the EF subscales (only "of each
// routine" is stated explicitly); it's a reasonable, consistent
// extrapolation that happens to match the Excel/app exactly, not a sentence
// you can point to in the paper. Tagged `// unverified vs paper wording`
// below even though the NUMBERS match exactly.

const { test, expect } = require('@playwright/test');
const { gotoApp, getItemsAndCutoffs } = require('./helpers/eforts-app');

const EXPECTED_CUTOFFS = {
  '3-5': {
    // Routine cutoffs — paper Table 5, quoted directly.
    morning: 2.45,
    play: 3.14,
    social: 2.71,
    total: 2.92,
    // EF cutoffs — M-1.5SD from paper Table 4. // unverified vs paper wording (dossier §H item 6)
    inh: 2.51,
    wm: 3.0,
    flex: 2.72,
  },
  '6-7': {
    morning: 2.74,
    play: 3.42,
    social: 2.85,
    total: 3.16,
    inh: 2.77,
    wm: 3.26,
    flex: 3.0,
  },
  '8-11': {
    morning: 2.76,
    play: 3.55,
    social: 3.04,
    total: 3.28,
    inh: 2.84,
    wm: 3.37,
    flex: 3.07,
  },
};

for (const ageBand of Object.keys(EXPECTED_CUTOFFS)) {
  test(`cutoffs for age band ${ageBand} match the paper (7 values)`, async ({ page }) => {
    await gotoApp(page);
    const { cutoffs } = await getItemsAndCutoffs(page);

    expect(cutoffs[ageBand]).toBeDefined();
    for (const scale of Object.keys(EXPECTED_CUTOFFS[ageBand])) {
      expect(cutoffs[ageBand][scale], `${ageBand}.${scale}`).toBe(EXPECTED_CUTOFFS[ageBand][scale]);
    }
  });
}

test('exactly 3 age bands, 7 scales each = 21 cutoff values', async ({ page }) => {
  await gotoApp(page);
  const { cutoffs } = await getItemsAndCutoffs(page);

  const bands = Object.keys(cutoffs);
  expect(bands.sort()).toEqual(['3-5', '6-7', '8-11']);
  for (const band of bands) {
    expect(Object.keys(cutoffs[band]).sort()).toEqual(
      ['flex', 'inh', 'morning', 'play', 'social', 'total', 'wm'].sort(),
    );
  }
});
