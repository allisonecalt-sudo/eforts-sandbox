// Locks updateAge()'s age-band boundary logic (app.js L260-302), which
// dossier §G names as having no test at all. Boundaries per dossier §D:
// totalYears >= 3 && < 6 -> '3-5'; >= 6 && < 8 -> '6-7'; >= 8 && < 12 ->
// '8-11'; otherwise out of range (rejected).
//
// Each case sets birth/fill dates so the computed age is EXACTLY the
// stated years/months (day-of-month fixed at 15 for both — see
// tests/helpers/eforts-app.js setAgeEdge() for why), then reads the app's
// own #ageGroup value after calling its own updateAge().

const { test, expect } = require('@playwright/test');
const { gotoApp, setAgeEdge } = require('./helpers/eforts-app');

const CASES = [
  { label: '2y11m — just under 3-5 band', years: 2, months: 11, expectedBand: '' },
  { label: '3y0m — bottom of 3-5 band', years: 3, months: 0, expectedBand: '3-5' },
  { label: '5y11m — top of 3-5 band', years: 5, months: 11, expectedBand: '3-5' },
  { label: '6y0m — bottom of 6-7 band', years: 6, months: 0, expectedBand: '6-7' },
  { label: '7y11m — top of 6-7 band', years: 7, months: 11, expectedBand: '6-7' },
  { label: '8y0m — bottom of 8-11 band', years: 8, months: 0, expectedBand: '8-11' },
  { label: '11y11m — top of 8-11 band', years: 11, months: 11, expectedBand: '8-11' },
  { label: '12y0m — just over 8-11 band', years: 12, months: 0, expectedBand: '' },
];

for (const c of CASES) {
  test(`age edge: ${c.label}`, async ({ page }) => {
    await gotoApp(page);
    const result = await setAgeEdge(page, c.years, c.months);

    expect(result.ageGroupValue, `${c.label} -> ageGroup value`).toBe(c.expectedBand);

    if (c.expectedBand === '') {
      expect(result.ageGroupDisplayText).toBe(
        'מחוץ לטווח הגילים של השאלון (3 עד 11 שנים ו-11 חודשים)',
      );
      expect(result.ageGroupDisplayClass).toContain('invalid');
    } else {
      expect(result.ageGroupDisplayClass).toContain('valid');
    }
  });
}
