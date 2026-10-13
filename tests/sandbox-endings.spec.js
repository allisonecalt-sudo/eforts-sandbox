// Sandbox: the three ways to END the clinical summary, and the standing line.
// Fixtures are the authors' anonymous model cases.
const { test, expect } = require('@playwright/test');
const { MODELS } = require('./helpers/eforts-parent');
const { gotoApp } = require('./helpers/eforts-app');

const STANDING = 'ההחלטה הסופית היא של המטפל/ת בלבד.';
const S1 = 'מומלץ על טיפול בריפוי בעיסוק לשיפור ניהול התפקוד והתפקודים הניהוליים.';
const S2 =
  'מומלץ להתבונן בפריטי השאלון, לבחון באילו שגרות הקשיים באים לידי ביטוי, ולשוחח עם ההורים על מקור הפער.';
const DETAILED_START = 'מומלץ על טיפול שיכלול הדרכת הורים';

async function fillAndCalc(page, model) {
  await gotoApp(page);
  const code = await page.evaluate((m) => EFORTSCode.encode(m), model);
  await page.locator('#importCode').fill(code);
  await page.locator('#importCodeBtn').click();
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();
  await expect(page.locator('#results')).toBeVisible();
}

const setMode = (page, id) =>
  page.locator(`input[name="endingMode"][value="${id}"]`).check({ force: true });

// Clicks text without the closing standing line, trimmed
async function clicksBody(page) {
  const text = await page.evaluate(() => buildClicksText());
  expect(text.trim().endsWith(STANDING)).toBe(true);
  return text.trim().slice(0, -STANDING.length).trim();
}

const CASES = [
  ['model-50 (all low)', MODELS.G50],
  ['model-32 (mixed)', MODELS.G32],
];

for (const [name, model] of CASES) {
  test.describe(name, () => {
    test('the chooser shows only with results, with the three labelled modes and default א', async ({
      page,
    }) => {
      await gotoApp(page);
      await expect(page.locator('#endingChooser')).toHaveCount(0);
      await fillAndCalc(page, model);
      await expect(page.locator('#endingChooser')).toBeVisible();
      const labels = await page.locator('.ending-seg span').allInnerTexts();
      expect(labels).toEqual(['א. תוצאות בלבד', 'ב. בחירה מרשימה', 'ג. עריכה חופשית']);
      await expect(page.locator('input[name="endingMode"][value="a"]')).toBeChecked();
      await expect(page.locator('#endingPick')).toBeHidden();
    });

    test('mode א: ends with the clinical text, no «מומלץ», standing line shown and copied', async ({
      page,
    }) => {
      await fillAndCalc(page, model);
      const screen = await page.locator('.summary-text').innerText();
      expect(screen).not.toContain('מומלץ');
      await expect(page.locator('.summary-text .summary-standing')).toHaveText(STANDING);
      const body = await clicksBody(page);
      expect(body).not.toContain('מומלץ');
    });

    test('mode ב: option 1, 2, 3, 4 end the summary as chosen', async ({ page }) => {
      await fillAndCalc(page, model);
      await setMode(page, 'b');
      await expect(page.locator('#endingPick')).toBeVisible();
      await expect(page.locator('.ending-hint')).toHaveText(
        'ההצעה הראשונה והשנייה: ניסוח כללי לפי כרמית פריש (13.10). השלישית: הניסוח הנוכחי באתר הראשי.',
      );
      // none chosen = like א
      expect(await clicksBody(page)).not.toContain('מומלץ');

      await page.selectOption('#endingChoice', '1');
      expect((await clicksBody(page)).endsWith(S1)).toBe(true);
      await expect(page.locator('.summary-text .summary-standing')).toHaveText(STANDING);

      await page.selectOption('#endingChoice', '2');
      expect((await clicksBody(page)).endsWith(S2)).toBe(true);

      await page.selectOption('#endingChoice', '3');
      const detailed = await page.evaluate(() => {
        const d = lastSummaryInput;
        return summaryPlain(buildSummaryParts(d).rec);
      });
      expect(detailed.startsWith(DETAILED_START)).toBe(true);
      expect((await clicksBody(page)).endsWith(detailed)).toBe(true);

      await page.selectOption('#endingChoice', '4');
      expect(await clicksBody(page)).not.toContain('מומלץ');
    });

    test('mode ב: the chosen ending reaches the AI export', async ({ page }) => {
      await fillAndCalc(page, model);
      await setMode(page, 'b');
      await page.selectOption('#endingChoice', '1');
      const ai = await page.evaluate(() => buildExportText());
      expect(ai).toContain(S1);
      expect(ai).toContain(STANDING);
    });

    test('mode ג: the summary is editable and edits reach the Clicks copy', async ({ page }) => {
      await fillAndCalc(page, model);
      const before = await clicksBody(page);
      await setMode(page, 'c');
      const box = page.locator('#summaryEdit');
      await expect(box).toBeVisible();
      expect(await box.inputValue()).toBe(before);
      await expect(page.locator('.summary-text .summary-standing')).toHaveText(STANDING);
      await expect(page.locator('#endingEditedNote')).toBeHidden();

      await box.fill(before + '\n\nמשפט סיום שנכתב ידנית.');
      await expect(page.locator('#endingEditedNote')).toHaveText('הטקסט נערך ידנית.');
      const text = await page.evaluate(() => buildClicksText());
      expect(text).toContain('משפט סיום שנכתב ידנית.');
      expect(text).toContain('הטקסט נערך ידנית.');
      expect(text.trim().endsWith(STANDING)).toBe(true);
      const ai = await page.evaluate(() => buildExportText());
      expect(ai).toContain('משפט סיום שנכתב ידנית.');
      expect(ai).toContain(STANDING);
    });
  });
}

test('mode ג starts from the ending chosen in ב', async ({ page }) => {
  await fillAndCalc(page, MODELS.G50);
  await setMode(page, 'b');
  await page.selectOption('#endingChoice', '2');
  await setMode(page, 'c');
  expect(await page.locator('#summaryEdit').inputValue()).toContain(S2);
});

test('the parent sheet opens in an editor first; the PDF is made from the edited text', async ({
  page,
}) => {
  await fillAndCalc(page, MODELS.G50);
  await page.click('.btn-parent-pdf');
  const box = page.locator('#parentEditText');
  await expect(box).toBeVisible();
  const text = await box.inputValue();
  expect(text).toContain('## בקצרה');
  await box.fill(text.replace('## בקצרה', '## בקצרה, נערך') + '\n\nשורה שהוספתי ידנית.');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-parent-make')]);
  await popup.waitForLoadState('domcontentloaded');
  const body = await popup.locator('body').innerText();
  expect(body).toContain('בקצרה, נערך');
  expect(body).toContain('שורה שהוספתי ידנית.');
});

test('sandbox pages: title, banner, no logos, noindex', async ({ page }) => {
  const T = 'EFORTS — אתר ניסוי (לא לשימוש קליני)';
  await gotoApp(page);
  expect(await page.title()).toBe(T);
  await expect(page.locator('.sandbox-banner')).toHaveText(
    'אתר ניסוי: כאן בודקים רעיונות לסיום הסיכום. לא לשימוש עם ילדים אמיתיים.',
  );
  await expect(page.locator('.header-sandbox')).toHaveText(T);
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.goto(page.url().replace(/[^/]*$/, 'parent.html'));
  expect(await page.title()).toBe(T);
  await expect(page.locator('.header-sandbox')).toHaveText(T);
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('mode א: the AI export asks for no recommendation paragraph or treatment goals', async ({
  page,
}) => {
  await fillAndCalc(page, MODELS.G50);
  const ai = await page.evaluate(() => buildExportText());
  expect(ai).not.toContain('מומלץ');
  expect(ai).not.toContain('מטרות טיפול');
  expect(ai).toContain(STANDING);
});

test('modes ב and ג: the AI instructions name the closing text and ask for no other', async ({
  page,
}) => {
  await fillAndCalc(page, MODELS.G50);
  await setMode(page, 'b');
  await page.selectOption('#endingChoice', '1');
  const ai = await page.evaluate(() => buildExportText());
  expect(ai).toContain('אל תכתוב משפט סיום או המלצה נוספים');
  expect(ai).not.toContain('פסקת "מומלץ"');
  await setMode(page, 'c');
  const ai2 = await page.evaluate(() => buildExportText());
  expect(ai2).toContain('אל תכתוב משפט סיום או המלצה נוספים');
});
