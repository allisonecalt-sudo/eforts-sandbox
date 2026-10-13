// Locks the two things dossier §G flags as having ZERO automated coverage:
//   1. buildSummary()'s exact output for Carmit Frisch's two hand-verified
//      model patients (golden-file byte equality).
//   2. The 7 computed averages (morning/play/social/total/inh/wm/flex) for
//      those same two patients.
//
// Both fixtures were verified by hand on 2026-08-26 against Carmit's own
// rewrites of these two patients' summaries — see
// second-brain/projects/clalit/eforts/evidence-dossier-2026-09-28.md §A.
// That makes them the golden standard: if either test below ever fails, the
// scoring math or buildSummary()'s output changed, and that diff must be
// reviewed against Carmit's originals before the golden file is updated
// (regenerate via `node tests/generate-golden.js`, then diff before commit).

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { gotoApp, computeFixture } = require('./helpers/eforts-app');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const fixtureFiles = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));

for (const file of fixtureFiles) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
  const goldenPath = path.join(GOLDEN_DIR, file.replace(/\.json$/, '.summary.txt'));

  test.describe(`model patient ${fixture.anonId} (${file})`, () => {
    test(`scores match the fixture's expected values`, async ({ page }) => {
      await gotoApp(page);
      const result = await computeFixture(page, fixture);

      // 2-decimal rounding, matching how the app displays scores
      // (scoreRow() uses score.toFixed(2) — app.js L671).
      expect(result.morning.toFixed(2)).toBe(fixture.expected.morning.toFixed(2));
      expect(result.play.toFixed(2)).toBe(fixture.expected.play.toFixed(2));
      expect(result.social.toFixed(2)).toBe(fixture.expected.social.toFixed(2));
      expect(result.total.toFixed(2)).toBe(fixture.expected.total.toFixed(2));
      expect(result.inhibition.toFixed(2)).toBe(fixture.expected.inhibition.toFixed(2));
      expect(result.workingMemory.toFixed(2)).toBe(fixture.expected.workingMemory.toFixed(2));
      expect(result.flexibility.toFixed(2)).toBe(fixture.expected.flexibility.toFixed(2));
    });

    test(`buildSummary() output matches the golden file exactly`, async ({ page }) => {
      await gotoApp(page);
      const result = await computeFixture(page, fixture);
      const golden = fs.readFileSync(goldenPath, 'utf8');

      if (result.summaryHtml !== golden) {
        // Byte-diff isn't very readable for one long HTML string — find the
        // first point of divergence and print context around it.
        let i = 0;
        while (
          i < result.summaryHtml.length &&
          i < golden.length &&
          result.summaryHtml[i] === golden[i]
        ) {
          i++;
        }
        const ctx = 80;
        const actualSlice = result.summaryHtml.slice(Math.max(0, i - ctx), i + ctx);
        const goldenSlice = golden.slice(Math.max(0, i - ctx), i + ctx);
        console.log(`\nSummary drifted from golden at char ${i}:`);
        console.log(`  golden : ...${goldenSlice}...`);
        console.log(`  actual : ...${actualSlice}...`);
      }

      expect(result.summaryHtml).toBe(golden);
    });
  });
}
