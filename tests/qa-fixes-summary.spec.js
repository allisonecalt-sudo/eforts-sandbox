// QA fix round (Allison, Sun 2026-10-11 "lets fix what we can"): the clinical
// summary rules S1-S7 and the parent-sheet strength filter. Each rule is
// checked as an INVARIANT over a seeded sweep of random answer sets in every
// age band, plus the named cases from the QA report (rnd-02).

const { test, expect } = require('@playwright/test');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

// rnd-02 from the QA report: female, band 6-7, every function below cutoff.
const RND02 = [
  1, 1, 3, 1, 3, 1, 2, 4, 2, 1, 1, 3, 1, 1, 4, 3, 1, 2, 4, 1, 1, 1, 2, 1, 1, 5, 1, 2, 2, 1,
];

// One in-page sweep: seeded random answer sets x 3 bands x both sexes. For
// each, returns the summary text plus the statuses the rules depend on.
async function sweep(page, perBand) {
  return page.evaluate((perBand) => {
    let seed = 20261011;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const out = [];
    ['3-5', '6-7', '8-11'].forEach((band) => {
      for (let n = 0; n < perBand; n++) {
        // a random bias per run so all-low / all-high / mixed all occur
        const bias = rnd();
        const scores = {};
        items.forEach((it) => {
          const r = rnd();
          scores[it.num] = Math.min(5, Math.max(1, 1 + Math.floor((r * 0.6 + bias * 0.4) * 5)));
        });
        const sexMale = n % 2 === 0;
        const c = cutoffs[band];
        const rAvg = (k) => avg(items.filter((i) => i.routine === k).map((i) => scores[i.num]));
        const eAvg = (k) => avg(items.filter((i) => i.ef === k).map((i) => scores[i.num]));
        const morningAvg = rAvg('morning');
        const playAvg = rAvg('play');
        const socialAvg = rAvg('social');
        const totalAvg = avg([morningAvg, playAvg, socialAvg]);
        const inhAvg = eAvg('inh');
        const wmAvg = eAvg('wm');
        const flexAvg = eAvg('flex');
        const html = buildSummary({
          anonId: '1',
          gender: sexMale ? 'זכר' : 'נקבה',
          isMale: sexMale,
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
        const st = (v, cut, kind) => cutoffStatus(v, cut, kind).key;
        out.push({
          band,
          scores,
          sexMale,
          text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
          ef: {
            inh: st(inhAvg, c.inh, 'ef'),
            wm: st(wmAvg, c.wm, 'ef'),
            flex: st(flexAvg, c.flex, 'ef'),
          },
          routines: {
            morning: st(morningAvg, c.morning, 'routine'),
            play: st(playAvg, c.play, 'routine'),
            social: st(socialAvg, c.social, 'routine'),
          },
          total: st(totalAvg, c.total, 'total'),
          strengthPhrases: Object.fromEntries(
            Object.entries(itemPhrases(sexMale).strengthPhrase).map(([k, v]) => [k, v]),
          ),
          itemEf: Object.fromEntries(
            items.map((i) => [i.num, i.ef || (i.num === 10 || i.num === 11 ? 'wm' : null)]),
          ),
        });
      }
    });
    return out;
  }, perBand);
}

test('S1: a function that is not clearly in norm is never named as a strength', async ({
  page,
}) => {
  await gotoApp(page);
  const runs = await sweep(page, 500);
  let checked = 0;
  for (const r of runs) {
    for (const [num, phrase] of Object.entries(r.strengthPhrases)) {
      const ef = r.itemEf[num];
      if (!ef || r.ef[ef] === 'norm') continue;
      if (r.scores[num] < 4) continue;
      checked++;
      expect(r.text, `band ${r.band} item ${num} (${ef} is ${r.ef[ef]})`).not.toContain(phrase);
    }
    for (const [ef, label] of [
      ['inh', 'העכבה'],
      ['wm', 'זיכרון העבודה'],
      ['flex', 'הגמישות המחשבתית'],
    ]) {
      if (r.ef[ef] !== 'norm') {
        expect(r.text).not.toContain(`בתחום ${label} באה לידי ביטוי`);
      }
    }
  }
  expect(checked).toBeGreaterThan(200); // the sweep really hit the risky cases
});

test('S1: rnd-02 (all functions below) names no strength function', async ({ page }) => {
  await gotoApp(page);
  const text = await page.evaluate((answers) => {
    const scores = {};
    items.forEach((it, i) => (scores[it.num] = answers[i]));
    const c = cutoffs['6-7'];
    const rAvg = (k) => avg(items.filter((i) => i.routine === k).map((i) => scores[i.num]));
    const eAvg = (k) => avg(items.filter((i) => i.ef === k).map((i) => scores[i.num]));
    const m = rAvg('morning');
    const p = rAvg('play');
    const s = rAvg('social');
    return buildSummary({
      anonId: '1',
      gender: 'נקבה',
      isMale: false,
      ageText: '',
      ageLabel: '',
      morningAvg: m,
      playAvg: p,
      socialAvg: s,
      totalAvg: avg([m, p, s]),
      inhAvg: eAvg('inh'),
      wmAvg: eAvg('wm'),
      flexAvg: eAvg('flex'),
      c,
      scores,
    }).replace(/<[^>]+>/g, ' ');
  }, RND02);
  expect(text).not.toContain('באה לידי ביטוי');
  expect(text).not.toContain('מצליחה');
});

test('S4: with no function below cutoff, a close function is never the explanation', async ({
  page,
}) => {
  await gotoApp(page);
  const runs = await sweep(page, 500);
  let checked = 0;
  for (const r of runs) {
    if (Object.values(r.ef).includes('below')) continue;
    checked++;
    for (const bad of ['מושפע מקושי ב', 'קשור לקושי ב', 'נובע לרוב מקושי ב', 'ולעיתים על רקע']) {
      expect(r.text, `band ${r.band}`).not.toContain(bad);
    }
  }
  expect(checked).toBeGreaterThan(100);
});

test('S5: the 4+12 twin phrase is a verb phrase', async ({ page }) => {
  await gotoApp(page);
  const runs = await sweep(page, 500);
  let seen = 0;
  for (const r of runs) {
    expect(r.text).not.toMatch(/בכך ש(הוא|היא) קושי/);
    if (r.text.includes('כמו הנחת בגדים במקום ופינוי כלים')) {
      seen++;
      expect(r.text).toContain('מתקשה להתארגן על פי כללי הבית');
    }
  }
  expect(seen).toBeGreaterThan(0);
});

test('S6: total below with no routine below says so, then the cross-function view and מומלץ', async ({
  page,
}) => {
  await gotoApp(page);
  const runs = await sweep(page, 1500);
  let seen = 0;
  for (const r of runs) {
    expect(r.text).not.toMatch(/בעיקר\s*\./);
    if (r.total === 'below' && !Object.values(r.routines).includes('below')) {
      seen++;
      expect(r.text).toMatch(/הציון הכולל נמוך מציון החתך \(קיבלה? ציון כולל/);
      expect(r.text).toContain('אף שהציון בכל שגרה בנפרד אינו נמוך מציון החתך.');
      expect(r.text).toContain('מומלץ');
      expect(r.text).not.toContain('בעיקר');
      const anyFn = Object.values(r.ef).some((v) => v !== 'norm');
      if (!anyFn) expect(r.text).not.toContain('בתפקודים');
    }
  }
  expect(seen).toBeGreaterThan(0);
});

test('S2 + S3: rounding is half-up and a below-cutoff score never prints equal to the cutoff', async ({
  page,
}) => {
  await gotoApp(page);
  const r = await page.evaluate(() => ({
    half: [fmtScore(3.375, 3.0), fmtScore(3.625, 3.0), fmtScore(3.3749999999999996, 3.0)],
    s3a: fmtScore(2.9199, 2.92),
    s3b: fmtScore(2.91999, 2.92),
    plain: fmtScore(2.5, 2.92),
    above: fmtScore(3.0, 2.92),
    atCut: fmtScore(2.92, 2.92),
  }));
  expect(r.half).toEqual(['3.38', '3.63', '3.38']);
  expect(r.s3a).toBe('2.919');
  expect(r.s3b).toBe('2.919');
  expect(r.s3a).not.toBe('2.920');
  expect(r.plain).toBe('2.50');
  expect(r.above).toBe('3.00');
  expect(r.atCut).toBe('2.92');
});

test('S7 + NITs: second paragraph with both functions uses «גם כאן…וכן לקושי», singular «ציון»', async ({
  page,
}) => {
  await gotoApp(page);
  const runs = await sweep(page, 1500);
  let s7 = 0;
  let singular = 0;
  let nit = 0;
  for (const r of runs) {
    if (r.text.includes('גם כאן נראה כי הקושי התפקודי קשור לקושי ב')) {
      if (/קשור לקושי ב[^.]*, וכן לקושי ב/.test(r.text)) s7++;
    }
    if (r.text.includes('מורים על ציון בטווח הנורמה')) singular++;
    if (!Object.values(r.routines).includes('below')) {
      expect(r.text).not.toMatch(/גיוס המוטיבציה של[הו], איסוף חוויות/);
      if (r.text.includes('איסוף חוויות')) {
        nit++;
        expect(r.text).toContain('ועל איסוף חוויות של הצלחה, גם אם קטנות');
      }
    }
  }
  expect(s7).toBeGreaterThan(0);
  expect(singular).toBeGreaterThan(0);
  expect(nit).toBeGreaterThan(0);
});

// ===== Parent sheet =====

async function parentSheet(page, scores, sex, years, months) {
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00+03:00'));
  await gotoApp(page);
  await fillAndCalculate(page, {
    sex,
    ageYearsBack: years,
    ageMonthsBack: months,
    itemScores: scores,
    anonId: '9876',
  });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-parent-pdf')]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForSelector('h1');
  return popup;
}

test('parent sheet: rnd-02 lists no strength whose skill is marked harder', async ({ page }) => {
  const scores = {};
  RND02.forEach((v, i) => (scores[i + 1] = v));
  const popup = await parentSheet(page, scores, 'female', 6, 6);
  const going = await popup.locator('section:has(h2:text-is("מה הולך טוב"))').innerText();
  // every skill is harder here, so no strength sentence at all
  expect(going).not.toContain('מצליחה');
  const chips = await popup.locator('.skill .chip').allInnerTexts();
  expect(chips).toEqual(['קשה יותר מהצפוי', 'קשה יותר מהצפוי', 'קשה יותר מהצפוי']);
});

test('parent sheet: all-low without a note prints on one page; meta line has no stray dot', async ({
  page,
}) => {
  const scores = {};
  for (let i = 1; i <= 30; i++) scores[i] = 1;
  const popup = await parentSheet(page, scores, 'male', 5, 7);
  const pdf = await popup.pdf({ preferCSSPageSize: true, printBackground: false });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  expect(pages).toBe(1);
  const meta = await popup.locator('body').innerText();
  expect(meta).not.toMatch(/בן ·/);
  expect(meta).toContain('בן 5 שנים ו-7 חודשים · תאריך מילוי:');
});

test('parent sheet: a low routine with no 1-2 answer gets the fallback line', async ({ page }) => {
  const scores = {};
  for (let i = 1; i <= 30; i++) scores[i] = 3;
  const popup = await parentSheet(page, scores, 'female', 6, 6);
  const txt = await popup.locator('body').innerText();
  expect(txt).toContain('התמונה עולה מכמה תשובות יחד, ולא מתשובה אחת בולטת.');
});

// ===== S4b (re-check): the close-function rule is per paragraph =====
// r2-close-primary-a / -b: a function is below overall, but one routine
// paragraph's weak items all belong to the CLOSE function (flexibility).
const CLOSE_PRIMARY = [
  {
    id: 'r2-close-primary-a',
    male: true,
    answers: [
      2, 2, 3, 2, 3, 2, 3, 2, 3, 2, 2, 2, 2, 3, 3, 1, 3, 3, 3, 3, 3, 2, 3, 4, 3, 3, 3, 5, 3, 3,
    ],
  },
  {
    id: 'r2-close-primary-b',
    male: false,
    answers: [
      2, 3, 4, 3, 1, 3, 2, 4, 1, 1, 3, 4, 3, 2, 4, 4, 2, 5, 3, 3, 1, 4, 4, 5, 5, 5, 1, 5, 5, 5,
    ],
  },
];

for (const c of CLOSE_PRIMARY) {
  test(`S4b: ${c.id} - a close function is only ever the secondary «ולעיתים», never alone`, async ({
    page,
  }) => {
    await gotoApp(page);
    const r = await page.evaluate(
      ({ answers, male }) => {
        const scores = {};
        items.forEach((it, i) => (scores[it.num] = answers[i]));
        const cut = cutoffs['8-11'];
        const rAvg = (k) => avg(items.filter((i) => i.routine === k).map((i) => scores[i.num]));
        const eAvg = (k) => avg(items.filter((i) => i.ef === k).map((i) => scores[i.num]));
        const m = rAvg('morning');
        const p = rAvg('play');
        const s = rAvg('social');
        const html = buildSummary({
          anonId: '1',
          gender: male ? 'זכר' : 'נקבה',
          isMale: male,
          ageText: '',
          ageLabel: '',
          morningAvg: m,
          playAvg: p,
          socialAvg: s,
          totalAvg: avg([m, p, s]),
          inhAvg: eAvg('inh'),
          wmAvg: eAvg('wm'),
          flexAvg: eAvg('flex'),
          c: cut,
          scores,
        });
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        return {
          text,
          flex: cutoffStatus(eAvg('flex'), cut.flex, 'ef').key,
          wm: cutoffStatus(eAvg('wm'), cut.wm, 'ef').key,
        };
      },
      { answers: c.answers, male: c.male },
    );
    expect(r.flex).toBe('close');
    expect(r.wm).toBe('below');
    // every sentence naming flexibility as a cause must be the secondary one
    const causes =
      r.text.match(/[^.]*(?:מושפע|קשור|נובע)[^.]*קושי ב(?:גמישות מחשבתית)[^.]*\./g) || [];
    for (const s of causes) {
      expect(s, s).toContain('ולעיתים על רקע קושי בגמישות מחשבתית');
    }
    expect(r.text).not.toMatch(/מושפע מקושי בגמישות מחשבתית/);
    expect(r.text).not.toMatch(/קשור לקושי בגמישות מחשבתית/);
  });
}

// ===== Outputs re-check nits =====
test('OT print: fill date is dd/mm/yyyy and summary paragraphs never split across pages', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-08T10:00:00+03:00'));
  await gotoApp(page);
  const scores = {};
  for (let i = 1; i <= 30; i++) scores[i] = 3;
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: scores,
    anonId: '55',
  });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-pdf')]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForSelector('.summary-box');
  const body = await popup.locator('body').innerText();
  expect(body).toMatch(/תאריך מילוי: \d{2}\/\d{2}\/\d{4}/);
  expect(body).not.toMatch(/תאריך מילוי: \d{1,2}\.\d{1,2}\.\d{4}/);
  const css = await popup.locator('style').first().innerText();
  expect(css).toMatch(/\.summary-box p\s*\{[^}]*break-inside:\s*avoid/);
  expect(css).toMatch(/\.summary-box p\s*\{[^}]*page-break-inside:\s*avoid/);
});

test('AI file: routine order matches rule 6, and rule 9 has no contradiction', async ({ page }) => {
  await gotoApp(page);
  const scores = {};
  for (let i = 1; i <= 30; i++) scores[i] = 3;
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: scores,
    anonId: '55',
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.btn-ai')]);
  const text = require('fs').readFileSync(await dl.path(), 'utf8');
  expect(text).toContain('שגרות פנאי ומשחק (17–23)');
  expect(text).not.toContain('שגרות משחק ופנאי');
  expect(text).not.toContain('ללא שום טקסט מקדים');
  expect(text).toContain(
    'בלי משפט פתיחה כמו "להלן הפסקה"; רק שורה אחת שאומרת איפה הפסקה נכנסת, ואחריה הפסקה.',
  );
});

// ===== close-stated (Allison 2026-10-11): a routine paragraph with no
// below-cutoff function states the close functions, score only, no cause. =====
const CAUSE_WORDS = ['נובע', 'מושפע', 'קשור'];

test('close-stated: ef-close fixture states the close function after the routine score sentence', async ({
  page,
}) => {
  const fs = require('fs');
  const golden = fs.readFileSync(
    require('path').join(__dirname, 'golden', 'model-ef-close.summary.txt'),
    'utf8',
  );
  expect(golden).toContain(
    'נמוך מציון החתך (קיבל ציון 3.00 כאשר ציון החתך הוא 3.14). הציון בזיכרון עבודה קרוב לציון החתך (קיבל ציון 3.00 כאשר ציון החתך הוא 3.00).',
  );
  await gotoApp(page);
});

for (const c of CLOSE_PRIMARY) {
  test(`close-stated: ${c.id} states the close function (flexibility), never as a cause`, async ({
    page,
  }) => {
    await gotoApp(page);
    const text = await page.evaluate(
      ({ answers, male }) => {
        const scores = {};
        items.forEach((it, i) => (scores[it.num] = answers[i]));
        const cut = cutoffs['8-11'];
        const rAvg = (k) => avg(items.filter((i) => i.routine === k).map((i) => scores[i.num]));
        const eAvg = (k) => avg(items.filter((i) => i.ef === k).map((i) => scores[i.num]));
        const m = rAvg('morning');
        const p = rAvg('play');
        const s = rAvg('social');
        return buildSummary({
          anonId: '1',
          gender: male ? 'זכר' : 'נקבה',
          isMale: male,
          ageText: '',
          ageLabel: '',
          morningAvg: m,
          playAvg: p,
          socialAvg: s,
          totalAvg: avg([m, p, s]),
          inhAvg: eAvg('inh'),
          wmAvg: eAvg('wm'),
          flexAvg: eAvg('flex'),
          c: cut,
          scores,
        })
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ');
      },
      { answers: c.answers, male: c.male },
    );
    const got = c.male ? 'קיבל' : 'קיבלה';
    expect(text).toContain(
      `הציון בגמישות מחשבתית קרוב לציון החתך (${got} ציון 3.13 כאשר ציון החתך הוא 3.07), ${c.male ? 'כמו למשל – מתקשה לעצור ולתכנן לפני המשחק (פריט 22)' : 'כמו למשל – מתקשה להישאר ממוקדת במשחק אחד (פריט 21)'}.`,
    );
    expect(text).not.toMatch(/(מושפע|קשור|נובע)( לרוב)? (מ|ל)?קושי בגמישות מחשבתית/);
  });
}

test('close-stated: sweep - routine-only paragraphs state every close function, with no cause words', async ({
  page,
}) => {
  await gotoApp(page);
  const runs = await sweep(page, 1500);
  let one = 0;
  let many = 0;
  for (const r of runs) {
    const belows = Object.values(r.ef).filter((v) => v === 'below').length;
    const closes = Object.values(r.ef).filter((v) => v === 'close').length;
    const routineBelow = Object.values(r.routines).includes('below');
    if (belows > 0 || closes === 0 || !routineBelow) continue;
    if (closes === 1) {
      one++;
      expect(r.text).toMatch(
        /\. הציון ב[^.]* קרוב לציון החתך \(קיבלה? ציון \d\.\d\d כאשר ציון החתך הוא/,
      );
    } else {
      many++;
      expect(r.text).toMatch(/\. הציונים ב[^.]* קרובים לציון החתך \(ב[^)]*קיבלה? ציון/);
    }
    const sentence = (r.text.match(/\. הציונ?י?ם? ב[^.]*קרובי?ם? ?ל?ציון החתך[^.]*\./) || [''])[0];
    for (const w of CAUSE_WORDS) expect(sentence).not.toContain(w);
  }
  expect(one).toBeGreaterThan(0);
  expect(many).toBeGreaterThan(0);
});
