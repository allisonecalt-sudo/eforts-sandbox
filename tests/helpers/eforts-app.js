// Shared helpers for driving the real app.js in a Playwright page.
//
// Not a test file itself (no .spec.js in the name, so Playwright's test
// runner won't try to load it as a suite).
//
// Why file:// and not a dev server: the app is 100% static (no fetch, no
// backend — see dossier §D "the app has no backend"), so loading
// index.html straight off disk via file:// exercises the exact same
// app.js/index.html/styles.css that GitHub Pages serves, with no server
// process to start/stop/port-clash in CI. playwright.config.js has no
// webServer block to reuse (the existing smoke test hits the *live*
// GitHub Pages URL on purpose, as a deploy-sanity check) — these tests
// intentionally hit the LOCAL working tree instead, so they catch a
// regression before it ships, not after.
//
// Why page.evaluate + real globals, not a re-implementation: app.js is a
// classic (non-module) script. Its top-level `const items` / `const
// cutoffs` are NOT attached to `window`, but they DO live in the shared
// per-realm script scope, which page.evaluate()'s injected function runs
// inside too — so `items`, `cutoffs`, `avg`, `buildSummary`, `calculate`,
// `updateAge` etc. are all directly callable from evaluate() callbacks
// below. That means every test here reads the app's REAL data/logic, not
// a hand-copied JS port of it (the gap flagged in dossier §G for
// test_scoring.py / verify_vs_paper.py).

const path = require('path');
const { pathToFileURL } = require('url');

const APP_PATH = pathToFileURL(path.resolve(__dirname, '..', '..', 'index.html')).href;

// Fixture ageBand strings ("3.0-5.11") -> the key app.js's `cutoffs` object
// actually uses ("3-5").
const AGE_BAND_KEY = {
  '3.0-5.11': '3-5',
  '6.0-7.11': '6-7',
  '8.0-11.11': '8-11',
};

async function gotoApp(page) {
  await page.goto(APP_PATH);
  await page.waitForSelector('#questionnaire .item-row');
}

// Computes the app's real routine/EF averages and the real buildSummary()
// output for a fixture — without touching the DOM at all. buildSummary()
// itself never reads document/window (verified by reading app.js L685-926),
// so this is a pure call into the loaded script.
async function computeFixture(page, fixture) {
  const ageBandKey = AGE_BAND_KEY[fixture.ageBand];
  if (!ageBandKey) {
    throw new Error(`Unknown ageBand "${fixture.ageBand}" — add it to AGE_BAND_KEY`);
  }
  return page.evaluate(
    ({ fx, ageBandKey }) => {
      const scores = {};
      Object.entries(fx.items).forEach(([num, val]) => {
        scores[Number(num)] = val;
      });

      const morningAvg = avg(
        items.filter((i) => i.routine === 'morning').map((i) => scores[i.num]),
      );
      const playAvg = avg(items.filter((i) => i.routine === 'play').map((i) => scores[i.num]));
      const socialAvg = avg(items.filter((i) => i.routine === 'social').map((i) => scores[i.num]));
      const totalAvg = avg([morningAvg, playAvg, socialAvg]);
      const inhAvg = avg(items.filter((i) => i.ef === 'inh').map((i) => scores[i.num]));
      const wmAvg = avg(items.filter((i) => i.ef === 'wm').map((i) => scores[i.num]));
      const flexAvg = avg(items.filter((i) => i.ef === 'flex').map((i) => scores[i.num]));

      const c = cutoffs[ageBandKey];
      const isMale = fx.sex === 'male';
      const gender = isMale ? 'זכר' : 'נקבה';

      const summaryHtml = buildSummary({
        anonId: fx.anonId,
        gender,
        isMale,
        ageText: '',
        ageLabel: '',
        morningAvg,
        playAvg,
        socialAvg,
        totalAvg,
        inhAvg,
        wmAvg,
        flexAvg,
        c,
        scores,
      });

      return {
        morning: morningAvg,
        play: playAvg,
        social: socialAvg,
        total: totalAvg,
        inhibition: inhAvg,
        workingMemory: wmAvg,
        flexibility: flexAvg,
        summaryHtml,
      };
    },
    { fx: fixture, ageBandKey },
  );
}

// Pulls the app's real item->scale map and cutoff table straight out of the
// loaded page (see the comment at the top of this file for why this works
// for `const` bindings that aren't on `window`).
async function getItemsAndCutoffs(page) {
  return page.evaluate(() => ({
    items: items.map((i) => ({ num: i.num, routine: i.routine, ef: i.ef })),
    cutoffs,
  }));
}

// Sets birth/fill dates so the computed age is exactly `yearsBack` years and
// `monthsBack` months before "today", then calls the app's own updateAge().
// Day-of-month is fixed at 15 for both dates so month-length/rollover never
// perturbs the years/months diff — the test controls exactly one thing
// (years/months back) independent of which real-world day it happens to run.
async function setAgeEdge(page, yearsBack, monthsBack) {
  return page.evaluate(
    ({ yearsBack, monthsBack }) => {
      const now = new Date();
      const fill = new Date(now.getFullYear(), now.getMonth(), 15);
      const birth = new Date(fill);
      birth.setFullYear(birth.getFullYear() - yearsBack);
      birth.setMonth(birth.getMonth() - monthsBack);

      document.getElementById('fillDay').value = String(fill.getDate());
      document.getElementById('fillMonth').value = String(fill.getMonth());
      document.getElementById('fillYear').value = String(fill.getFullYear());
      document.getElementById('birthDay').value = String(birth.getDate());
      document.getElementById('birthMonth').value = String(birth.getMonth());
      document.getElementById('birthYear').value = String(birth.getFullYear());

      updateAge();

      return {
        ageGroupValue: document.getElementById('ageGroup').value,
        ageGroupDisplayText: document.getElementById('ageGroupDisplay').textContent,
        ageGroupDisplayClass: document.getElementById('ageGroupDisplay').className,
      };
    },
    { yearsBack, monthsBack },
  );
}

// Fills the full 30-item form + demographics via the real DOM and calls the
// app's real calculate() — the true end-to-end path a clinician's browser
// runs. Returns the rendered #results innerHTML for assertion.
async function fillAndCalculate(page, { sex, ageYearsBack, ageMonthsBack, itemScores, anonId }) {
  await setAgeEdge(page, ageYearsBack, ageMonthsBack);
  return page.evaluate(
    ({ sex, itemScores, anonId }) => {
      document.getElementById('anonId').value = anonId || 'test';
      document.getElementById('childGender').value = sex;
      Object.entries(itemScores).forEach(([num, val]) => {
        const radio = document.getElementById(`q${num}_${val}`);
        if (radio) radio.checked = true;
      });
      calculate();
      return document.getElementById('results').innerHTML;
    },
    { sex, itemScores, anonId },
  );
}

// Slices one score row (from its toggleDrill onclick to its drilldown div)
// and returns the value / gauge / status signals scoreRow() rendered.
function extractRowSignals(resultsHtml, id) {
  const start = resultsHtml.indexOf(`toggleDrill('${id}')`);
  if (start === -1) throw new Error(`Row ${id} not found in results HTML`);
  const end = resultsHtml.indexOf(`id="drill_${id}"`, start);
  const rowHtml = resultsHtml.slice(start, end === -1 ? undefined : end);
  const pick = (re) => {
    const m = rowHtml.match(re);
    if (!m) throw new Error(`${re} not found in row ${id}:\n${rowHtml}`);
    return m;
  };
  const value = pick(/score-value (\w+)">([\d.]+)</);
  const gauge = pick(/gauge-fill (\w+)"/);
  const status = pick(/score-status (\w+)">([^<]+)</);
  return {
    rowHtml,
    score: value[2],
    valueCls: value[1],
    gaugeCls: gauge[1],
    statusCls: status[1],
    statusText: status[2],
  };
}

module.exports = {
  APP_PATH,
  AGE_BAND_KEY,
  gotoApp,
  computeFixture,
  getItemsAndCutoffs,
  setAgeEdge,
  fillAndCalculate,
  extractRowSignals,
};
