// The parent results PDF on the OT page («PDF להורים»): right branch per
// fixture, chips match cutoffStatus, gender forms, no numbers / item
// references / anonymous number, the OT note only when typed. Also saves
// each popup as a PDF to look at by eye.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { gotoApp, fillAndCalculate, AGE_BAND_KEY } = require('./helpers/eforts-app');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

const PDF_DIR = path.join(os.homedir(), 'Downloads', 'EFORTS-test-PDFs');

const FIXTURES = [
  { name: 'model-50', branch: 'B' },
  { name: 'model-32', branch: 'B' },
  { name: 'model-ef-only', branch: 'C' },
  { name: 'model-norm', branch: 'A' },
  { name: 'model-50f', branch: 'B' },
];

const BRIEF = {
  A: 'כצפוי',
  B: 'יותר מהצפוי',
  C: 'עלה קושי',
  D: 'התמונה הכללית מעט נמוכה',
};

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
}

// Fills the form like a clinician, optionally types a note, clicks
// «PDF להורים» and returns the popup page + its HTML.
async function openParentSheet(page, fx, note) {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+03:00'));
  await gotoApp(page);
  await fillAndCalculate(page, {
    sex: fx.sex,
    ageYearsBack: fx.ageYears,
    ageMonthsBack: fx.ageMonths,
    itemScores: fx.items,
    anonId: '9876',
  });
  if (note !== undefined) await page.fill('#parentNote', note);
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-parent-pdf')]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForSelector('h1');
  return { popup, html: await popup.content() };
}

// Status of the three routines and three skills, from the app's own
// cutoffStatus() on the app's own averages.
async function liveStatuses(page, fx) {
  const key = AGE_BAND_KEY[fx.ageBand];
  return page.evaluate(
    ({ key, scoresIn }) => {
      const scores = {};
      Object.entries(scoresIn).forEach(([n, v]) => {
        scores[Number(n)] = v;
      });
      const c = cutoffs[key];
      const r = (k) => avg(items.filter((i) => i.routine === k).map((i) => scores[i.num]));
      const s = (k) => avg(items.filter((i) => i.ef === k).map((i) => scores[i.num]));
      return {
        routines: ['morning', 'play', 'social'].map(
          (k) => cutoffStatus(r(k), c[k], 'routine').key === 'below',
        ),
        skills: ['inh', 'wm', 'flex'].map((k) => cutoffStatus(s(k), c[k], 'ef').key === 'below'),
      };
    },
    { key, scoresIn: fx.items },
  );
}

const ROUTINE_NAMES = ['שגרת בוקר וערב', 'שגרת פנאי ומשחק', 'שגרה חברתית'];
const SKILL_NAMES = [
  'עצירה לפני תגובה (עכבה)',
  'החזקת מידע בראש (זיכרון עבודה)',
  'יוזמה וגמישות (גמישות מחשבתית)',
];

for (const { name, branch } of FIXTURES) {
  test(`parent sheet — ${name}: branch ${branch}, chips, no numbers`, async ({ page }) => {
    const fx = loadFixture(name);
    const { popup, html } = await openParentSheet(page, fx);
    const text = await popup.locator('body').innerText();

    // branch
    for (const [b, snippet] of Object.entries(BRIEF)) {
      if (b === branch) expect(text).toContain(snippet);
    }
    const briefText = await popup.locator('section:has(h2:text-is("בקצרה")) p').innerText();
    if (branch === 'A') expect(briefText).not.toContain('הפירוט בהמשך');
    const live0 = await liveStatuses(page, fx);
    const nLowR = live0.routines.filter(Boolean).length;
    const nLowS = live0.skills.filter(Boolean).length;
    if (branch === 'B') {
      expect(briefText).toContain(nLowR === 1 ? ' קשה ' : 'יש שגרות שקשות');
      if (nLowR === 1) expect(briefText).not.toContain('יש שגרות');
    }
    if (branch === 'C') {
      expect(briefText).toContain(nLowS === 1 ? 'עלה קושי באחת המיומנויות' : 'בחלק מהמיומנויות');
    }

    // "what is harder" section only in B and C
    const hasHarder = await popup.locator('h2:text-is("מה קשה יותר מהצפוי")').count();
    expect(hasHarder).toBe(branch === 'B' || branch === 'C' ? 1 : 0);

    // chips follow cutoffStatus
    const live = await liveStatuses(page, fx);
    const skillBlocks = popup.locator('.skill');
    for (let i = 0; i < 3; i++) {
      const block = skillBlocks.nth(i);
      await expect(block).toContainText(SKILL_NAMES[i]);
      await expect(block.locator('.chip')).toHaveText(
        live.skills[i] ? 'קשה יותר מהצפוי' : 'כצפוי לגיל',
      );
    }
    // routine status: a routine at expected level has its line in "what is going well"
    const going = await popup.locator('section:has(h2:text-is("מה הולך טוב"))').innerText();
    ROUTINE_NAMES.forEach((rn, i) => {
      if (live.routines[i]) {
        expect(going).not.toContain(`${rn}: כצפוי לגיל.`);
        expect(text).toContain(`${rn}: קשה יותר מהצפוי לגיל — כדאי לדבר על זה.`);
      } else {
        expect(going).toContain(`${rn}: כצפוי לגיל.`);
      }
    });

    // gender
    if (fx.sex === 'female') {
      expect(text).toContain('בתכם');
      expect(text).toContain('מתנהלת');
      expect(text).toContain('לגילה');
      expect(text).not.toContain('בנכם');
    } else {
      expect(text).toContain('בנכם');
      expect(text).not.toContain('בתכם');
    }

    // never shown to parents
    expect(html).not.toContain('9876');
    for (const bad of ['ציון', 'פריט', 'חתך', 'AI']) expect(text).not.toContain(bad);
    expect(text).toContain('ואינו מעיד על ההורות שלכם');
    expect(text).not.toMatch(/\d\.\d\d/);
    expect(text).toContain('סיכום התוצאות להורים');
    expect(text).toContain('הסיכום נכתב להורים ואינו מחליף את דוח האבחון');
    expect(text).not.toContain('הערה מהמטפל/ת');

    fs.mkdirSync(PDF_DIR, { recursive: true });
    await popup.pdf({
      path: path.join(PDF_DIR, `parent-sheet-${name}.pdf`),
      format: 'A4',
      printBackground: false,
    });
  });
}

test('parent sheet — the OT note appears only when typed, escaped, never saved', async ({
  page,
}) => {
  const fx = loadFixture('model-50');
  const { popup, html } = await openParentSheet(page, fx, 'לנסות <b>דבר אחד</b>\nבבוקר');
  expect(html).toContain('הערה מהמטפל/ת');
  expect(html).toContain('&lt;b&gt;דבר אחד&lt;/b&gt;<br>בבוקר');
  await expect(popup.locator('.note')).toContainText('בבוקר');

  // not remembered: nothing in localStorage, and a fresh sheet is clean
  const stored = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
  expect(stored).not.toContain('דבר אחד');
  const fresh = await openParentSheet(page, fx);
  expect(fresh.html).not.toContain('הערה מהמטפל/ת');
});

test('OT results screen — buttons and note box', async ({ page }) => {
  const fx = loadFixture('model-50');
  await gotoApp(page);
  await fillAndCalculate(page, {
    sex: fx.sex,
    ageYearsBack: fx.ageYears,
    ageMonthsBack: fx.ageMonths,
    itemScores: fx.items,
  });
  await expect(page.locator('.btn-pdf')).toHaveText('PDF למטפל/ת');
  await expect(page.locator('.btn-parent-pdf')).toHaveText('PDF להורים');
  await expect(page.locator('.parent-box-title')).toHaveText('דף להורים');
  await expect(page.locator('label[for="parentNote"]')).toHaveText(
    'הערה אישית (לא חובה) — תופיע בדף להורים',
  );
  await expect(page.locator('.parent-box-hint')).toHaveText(
    'מומלץ למסור להורים בפגישה או מיד אחריה.',
  );
});
