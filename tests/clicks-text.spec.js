// «הורדה לקליקס (טקסט)» — Sara Orit's Oct 7 email (brackets landed in the wrong
// place when the summary was copied from the PDF into Clicks) and Allison's fix
// (Sun 2026-10-11): a Notepad file, "the best for copying and pasting".
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { MODELS } = require('./helpers/eforts-parent');
const { gotoApp } = require('./helpers/eforts-app');

async function fillAndCalc(page, model, anon) {
  await gotoApp(page);
  const code = await page.evaluate((m) => EFORTSCode.encode(m), model);
  await page.locator('#importCode').fill(code);
  await page.locator('#importCodeBtn').click();
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importAnon').fill(anon);
  await page.locator('#importApply').click();
  await expect(page.locator('#results')).toBeVisible();
}

test.describe('Clicks text download', () => {
  test('downloads the summary as clean Notepad text, brackets in reading order', async ({
    page,
  }) => {
    await fillAndCalc(page, MODELS.G50, '7');
    const btn = page.locator('.btn-clicks');
    await expect(btn).toHaveText('או: הורדה כקובץ טקסט (Notepad)');
    const dlP = page.waitForEvent('download');
    await btn.click();
    const dl = await dlP;
    expect(dl.suggestedFilename()).toBe('EFORTS_7_2026-09-28_clicks.txt');
    const raw = fs.readFileSync(await dl.path(), 'utf-8');
    expect(raw.charCodeAt(0)).toBe(0xfeff);
    const text = raw.slice(1);
    expect(text).toContain('\r\n');
    expect(text).not.toMatch(/<[^>]+>/);
    expect(text).not.toMatch(/&[a-z#0-9]+;/);
    expect(text.startsWith('תמונה כללית')).toBe(true);
    // brackets in logical order: "(קיבל ציון … הוא 2.92)" — never ")…("
    expect(text).toContain('(קיבל ציון כולל 2.46 כאשר ציון החתך הוא 2.92)');
    expect(text).toContain('(פריט 1 ופריט 9)');
    expect(text).not.toMatch(/\)קיבל/);
    // same words as the on-screen summary
    const expected = await page.evaluate(() => buildClicksText());
    expect(text.replace(/\r\n/g, '\n').trim()).toBe(expected.trim());
    // the anonymous number is not inside the summary sentences
    expect(text).not.toContain('של 7');
  });
});
