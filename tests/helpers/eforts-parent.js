// Shared helpers for driving parent.html in a Playwright page, mirroring
// tests/helpers/eforts-app.js's file:// pattern (see that file's header
// comment for why file:// and not a dev server).
//
// FORMAT NOTE (2026-09-28, mid-build amendment from Allison, overriding
// PF-spec-2026-09-28.md §C): the parent page collects sex + date of birth
// only — no anonymous code/ID field. The codec model is:
//   { sex: 'male'|'female', dob: 'YYYY-MM-DD', date: 'YYYY-MM-DD',
//     with: { morning, play, social }, answers: [30 ints 1..5] }
// GOLDEN below was generated from tests/fixtures/model-50.json etc. via the
// real EFORTSCode.encode() (see the branch's commit notes for how), not
// hand-computed, so a codec regression here means a real checksum mismatch,
// not a typo in a fixture.

const path = require('path');
const { pathToFileURL } = require('url');

const PARENT_PATH = pathToFileURL(path.resolve(__dirname, '..', '..', 'parent.html')).href;
const REPO_URL = pathToFileURL(path.resolve(__dirname, '..', '..') + path.sep).href;

const GOLDEN = {
  G50: 'EFORTS1|sex=m|dob=2021-02-28|date=2026-09-28|with=m,b,-|a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2|k=le',
  G32: 'EFORTS1|sex=m|dob=2020-07-28|date=2026-09-28|with=-,-,-|a=2,1,4,3,2,1,3,3,1,1,2,2,4,1,2,1,3,5,5,5,5,5,4,4,4,5,5,4,3,4|k=xy',
  G50F: 'EFORTS1|sex=f|dob=2021-02-28|date=2026-09-28|with=-,-,-|a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2|k=u6',
  WORST:
    'EFORTS1|sex=f|dob=2016-01-01|date=2026-12-31|with=b,b,b|a=2,1,4,3,2,1,3,3,1,1,2,2,4,1,2,1,3,5,5,5,5,5,4,4,4,5,5,4,3,4|k=r9',
  BAD_SUM:
    'EFORTS1|sex=m|dob=2021-02-28|date=2026-09-28|with=m,b,-|a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,5,2,2,3,3,4,3,3,3,1,3,2,4,2|k=le',
  BAD_29:
    'EFORTS1|sex=m|dob=2021-02-28|date=2026-09-28|with=m,b,-|a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4|k=54',
  BAD_6:
    'EFORTS1|sex=m|dob=2021-02-28|date=2026-09-28|with=m,b,-|a=6,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2|k=tl',
};

function answersFromFixture(fx) {
  const arr = [];
  for (let i = 1; i <= 30; i++) arr.push(fx.items[String(i)]);
  return arr;
}

// tests/fixtures/*.json carry the clinician app's model-50/32/50f patients
// (sex + item scores). dob/date/with are the parent-side additions fixed
// for these tests — dob is the same estimated-birth-date value the app's
// own age math would produce for these patients' documented ages at fill
// date 2026-09-28 (5;7 -> 2021-02-28, 6;2 -> 2020-07-28).
const MODELS = {
  G50: {
    sex: 'male',
    dob: '2021-02-28',
    date: '2026-09-28',
    with: { morning: 'mom', play: 'both', social: '' },
    answers: answersFromFixture(require('../fixtures/model-50.json')),
  },
  G32: {
    sex: 'male',
    dob: '2020-07-28',
    date: '2026-09-28',
    with: { morning: '', play: '', social: '' },
    answers: answersFromFixture(require('../fixtures/model-32.json')),
  },
  G50F: {
    sex: 'female',
    dob: '2021-02-28',
    date: '2026-09-28',
    with: { morning: '', play: '', social: '' },
    answers: answersFromFixture(require('../fixtures/model-50f.json')),
  },
  WORST: {
    sex: 'female',
    dob: '2016-01-01',
    date: '2026-12-31',
    with: { morning: 'both', play: 'both', social: 'both' },
    answers: answersFromFixture(require('../fixtures/model-32.json')),
  },
};

async function gotoParent(page, query = '') {
  await page.goto(PARENT_PATH + query);
  await page.waitForSelector('#pQuestionnaire .p-item');
}

// Date of birth is three selects (day / month / year). Years outside the
// offered range are added as an option first, the way an old saved draft is
// restored, so the age/future checks can still be driven.
async function setDob(page, iso) {
  const [y, m, d] = iso ? iso.split('-').map((x) => String(Number(x))) : ['', '', ''];
  if (y) {
    await page.evaluate((yr) => {
      const s = document.getElementById('pDobYear');
      if (![...s.options].some((o) => o.value === yr)) {
        const o = document.createElement('option');
        o.value = yr;
        o.textContent = yr;
        s.appendChild(o);
      }
    }, y);
  }
  await page.locator('#pDobYear').selectOption(y);
  await page.locator('#pDobMonth').selectOption(m);
  await page.locator('#pDobDay').selectOption(d);
}

async function getDob(page) {
  return page.evaluate(() =>
    ['pDobYear', 'pDobMonth', 'pDobDay'].map((id) => document.getElementById(id).value).join('-'),
  );
}

// Fills the form via the real DOM — the true user path. sex/dob are set
// directly (native controls); companions and answers are clicked via their
// labels, same as a tap on a phone.
async function fillParent(page, model) {
  await page.locator(`label[for="pSex_${model.sex === 'male' ? 'm' : 'f'}"]`).click();
  await setDob(page, model.dob);
  for (const key of ['morning', 'play', 'social']) {
    if (model.with[key]) {
      await page.locator(`#pWith_${key} .p-choice[data-value="${model.with[key]}"]`).click();
    }
  }
  for (let i = 0; i < model.answers.length; i++) {
    const n = i + 1;
    const v = model.answers[i];
    await page.locator(`label[for="pq${n}_${v}"]`).click();
  }
}

// Taps the main button on the done screen (computer path: it downloads the
// PDF) and returns the saved file's path + suggested name.
async function downloadPdf(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#pSend').click();
  const download = await downloadPromise;
  return { path: await download.path(), name: download.suggestedFilename() };
}

module.exports = {
  setDob,
  getDob,
  downloadPdf,
  PARENT_PATH,
  REPO_URL,
  GOLDEN,
  MODELS,
  gotoParent,
  fillParent,
};
