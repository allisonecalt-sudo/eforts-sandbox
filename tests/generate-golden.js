// Regenerates tests/golden/*.summary.txt from the CURRENT app.js.
//
// Run manually: node tests/generate-golden.js
//
// Only run this after an INTENTIONAL, reviewed change to buildSummary()
// (or the items/cutoffs it reads) — golden.spec.js asserts byte-equality
// against these files on every run, specifically so a change never drifts
// silently. Regenerating them is how you consciously move the goalposts;
// review the diff in tests/golden/ before committing it.
//
// This script is intentionally NOT a Playwright test (it writes files as a
// side effect, which a test suite should never do).

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { gotoApp, computeFixture } = require('./helpers/eforts-app');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

async function main() {
  if (!fs.existsSync(GOLDEN_DIR)) fs.mkdirSync(GOLDEN_DIR, { recursive: true });

  const fixtureFiles = fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await gotoApp(page);

  for (const file of fixtureFiles) {
    const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
    const result = await computeFixture(page, fixture);
    const goldenPath = path.join(GOLDEN_DIR, file.replace(/\.json$/, '.summary.txt'));
    fs.writeFileSync(goldenPath, result.summaryHtml, 'utf8');
    console.log(`Wrote ${goldenPath} (${result.summaryHtml.length} chars)`);
    console.log(
      `  scores: morning=${result.morning.toFixed(2)} play=${result.play.toFixed(2)} ` +
        `social=${result.social.toFixed(2)} total=${result.total.toFixed(2)} ` +
        `inh=${result.inhibition.toFixed(2)} wm=${result.workingMemory.toFixed(2)} ` +
        `flex=${result.flexibility.toFixed(2)}`,
    );
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
