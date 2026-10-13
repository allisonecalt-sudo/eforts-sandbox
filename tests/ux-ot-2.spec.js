// UX round 2, OT page (2026-10-11): preview hides the details card, download
// messages under their own links, AI file header, parent-sheet extras, Clicks
// text spacing, all-gaps warning, header scoping (parent page unaffected).

const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');
const { MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

const NOW = new Date('2026-10-11T10:00:00+03:00');
const SCORES = {};
for (let i = 1; i <= 30; i++) SCORES[i] = (i % 5) + 1;

async function open(page) {
  await page.clock.setFixedTime(NOW);
  await gotoApp(page);
}

async function previewG50(page) {
  const code = await page.evaluate((m) => EFORTSCode.encode(m), MODELS.G50);
  await page.locator('#importCode').fill(code);
  await page.locator('#importCodeBtn').click();
  await expect(page.locator('#importPreview')).toBeVisible();
}

async function results(page, anonId = '31') {
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: SCORES,
    anonId,
  });
  await expect(page.locator('#results')).toBeVisible();
}

test('R1: preview hides the details card, focuses its number, Enter fills and calculates', async ({
  page,
}) => {
  await open(page);
  await previewG50(page);
  await expect(page.locator('.info-card').first()).toBeHidden();
  await expect(page.locator('#anonId')).toBeHidden();
  await expect(page.locator('#importAnon')).toBeFocused();
  await page.locator('#importAnon').fill('42');
  await page.keyboard.press('Enter');
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('.results-meta')).toContainText('42');
});

test('R1b: cancelling the preview brings the details card back', async ({ page }) => {
  await open(page);
  await previewG50(page);
  await page.locator('#importCancel, #importPreview button:has-text("ביטול")').first().click();
  await expect(page.locator('#importPreview')).toBeHidden();
  await expect(page.locator('.info-card').first()).toBeVisible();
});

test('R2/R3: each download message sits under its own link; AI file is named and headed', async ({
  page,
}) => {
  await open(page);
  await results(page);
  const fillIso = await page.evaluate(() => getFillDateValue());

  const dl1 = page.waitForEvent('download');
  await page.click('.btn-ai');
  const d1 = await dl1;
  expect(d1.suggestedFilename()).toBe(`EFORTS_31_${fillIso}_AI.txt`);
  const aiText = await page.locator('#aiStatus').innerText();
  expect(aiText).toBe('הקובץ ירד — העל/י אותו לכלי ה-AI וכתוב/י לו מה נצפה במפגש.');
  expect(aiText).not.toContain('העתק/י לקליקס');
  // directly under its link, same column
  const sameCol = await page.evaluate(() =>
    document.getElementById('aiStatus').previousElementSibling.classList.contains('btn-ai'),
  );
  expect(sameCol).toBe(true);

  const dl2 = page.waitForEvent('download');
  await page.click('.btn-clicks');
  await dl2;
  await expect(page.locator('#downloadStatus')).not.toHaveText('');
  await expect(page.locator('#aiStatus')).toHaveText('');
  const clicksPrev = await page.evaluate(
    () => document.getElementById('downloadStatus').previousElementSibling.className,
  );
  expect(clicksPrev).toContain('btn-clicks');

  const text = await page.evaluate(() => buildExportText());
  const lines = text.split('\n');
  expect(lines[0]).toBe(
    'למטפל/ת: קובץ זה מיועד לכלי AI (Claude, ChatGPT, Copilot). העל/י אותו לכלי, ספר/י לו מה נצפה במפגש, והוא יכתוב פסקה אחת לשילוב בסיכום.',
  );
  expect(lines[1]).toBe('אין להדביק קובץ זה בקליקס — לקליקס משתמשים בכפתור "העתקה לקליקס".');
  expect(lines[2]).toMatch(/^─+$/);
  await expect(
    page.locator('details summary').filter({ hasText: 'מה עושים עם קובץ ה-AI?' }),
  ).toBeVisible();
});

test('R5: parent sheet — chip beside skill name, contact line, blank name field, nothing stored', async ({
  page,
}) => {
  await open(page);
  await results(page);
  await page.locator('#parentContact').fill('טלפון המכון 02-0000000');
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-parent-pdf')]);
  await popup.waitForLoadState('domcontentloaded');
  const body = await popup.locator('body').innerText();
  expect(body).toContain('לשאלות: טלפון המכון 02-0000000');
  expect(body).toContain('שם הילד/ה: ________________');
  const flex = await popup.evaluate(() => {
    const h = document.querySelector('.skill-head');
    return h ? window.getComputedStyle(h).justifyContent : null;
  });
  expect(flex).toBe('flex-start');
  const stored = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  expect(stored).not.toContain('02-0000000');
});

test('R5b: without contact text the default line stays', async ({ page }) => {
  await open(page);
  await results(page);
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-parent-pdf')]);
  await popup.waitForLoadState('domcontentloaded');
  const body = await popup.locator('body').innerText();
  expect(body).toContain('אפשר לפנות לצוות הריפוי בעיסוק.');
  expect(body).not.toContain('לשאלות: ');
});

test('R4: OT print has a footer, a repeating thead and an unbroken summary box', async ({
  page,
}) => {
  await open(page);
  await results(page);
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.btn-pdf')]);
  await popup.waitForLoadState('domcontentloaded');
  const footer = await popup.locator('.page-footer').textContent();
  expect(footer).toBe("EFORTS · מטופל מס' 31 · תאריך מילוי 15/10/2026");
  const info = await popup.evaluate(() => ({
    thead: window.getComputedStyle(document.querySelector('thead')).display,
    box: window.getComputedStyle(document.querySelector('.summary-box')).breakInside,
  }));
  expect(info.box).toBe('avoid');
  expect(info.thead).toBe('table-header-group');
});

test('R6: Clicks text — heading directly followed by its paragraph, one blank line between', async ({
  page,
}) => {
  await open(page);
  await results(page);
  const t = (await page.evaluate(() => buildClicksText())).replace(/\r\n/g, '\n');
  expect(t).not.toMatch(/\n\n\n/);
  const html = await page.locator('.summary-text').innerHTML();
  const headings = [...html.matchAll(/<p style="font-weight:700;[^>]*>([^<]*)<\/p>/g)].map((m) =>
    m[1].trim(),
  );
  expect(headings.length).toBeGreaterThan(0);
  const lines = t.split('\n');
  for (const h of headings) {
    const i = lines.findIndex((l) => l.trim() === h);
    expect(i, h).toBeGreaterThanOrEqual(0);
    expect(lines[i + 1].trim(), h).not.toBe('');
    if (i > 0) expect(lines[i - 1].trim(), h).toBe('');
  }
});

test('R8: calculating an empty form marks every gap and focuses the first', async ({ page }) => {
  await open(page);
  await page.evaluate(() => calculate());
  const invalid = await page.locator('.field-invalid').count();
  expect(invalid).toBeGreaterThanOrEqual(4);
  await expect(page.locator('#anonId')).toHaveClass(/field-invalid/);
  await expect(page.locator('#childGender')).toHaveClass(/field-invalid/);
  await expect(page.locator('#warning')).toContainText('יש להשלים לפני החישוב');
});

test('R10: summary text is right-aligned', async ({ page }) => {
  await open(page);
  await results(page);
  const ta = await page
    .locator('.summary-text')
    .evaluate((el) => window.getComputedStyle(el).textAlign);
  expect(['right', 'start']).toContain(ta);
});

test('R9: at phone width the citation is one line and chips are short', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  const ws = await page
    .locator('.header-citation')
    .evaluate((el) => window.getComputedStyle(el).whiteSpace);
  expect(ws).toBe('nowrap');
  await results(page);
  const chip = await page.locator('.score-status').first();
  const fs = await chip.evaluate((el) => window.getComputedStyle(el).fontSize);
  expect(fs).toBe('0px');
  const after = await chip.evaluate((el) => window.getComputedStyle(el, '::after').content);
  expect(after).toMatch(/נמוך מהחתך|קרוב לחתך|בנורמה/);
});

test('R11: header rules are OT-only — the parent page keeps «שאלון להורים»', async ({ page }) => {
  await open(page);
  await expect(page.locator('body')).toHaveClass(/\bot\b/);
  await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'parent.html')).href);
  const sub = page.locator('.header-subtitle');
  await expect(sub).toBeVisible();
  await expect(sub).toHaveText('שאלון להורים');
});
