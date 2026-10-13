// Final OT-page round (Allison 2026-10-11 "just fix it all"): keyboard use,
// accessible names, text contrast, error wording, the print hint, the
// copied-link status timeout.
const { test, expect } = require('@playwright/test');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');
const { GOLDEN } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

async function calcWithResults(page) {
  const scores = {};
  for (let i = 1; i <= 30; i++) scores[i] = 3;
  scores[1] = 1;
  scores[2] = 2;
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 9,
    ageMonthsBack: 0,
    itemScores: scores,
    anonId: '50',
  });
  await expect(page.locator('#results')).toBeVisible();
}

test.describe('1. keyboard', () => {
  for (const key of ['Enter', 'Space']) {
    test(`the file chooser is a real button, reachable by Tab, ${key} opens the file input`, async ({
      page,
    }) => {
      await gotoApp(page);
      const btn = page.locator('#importFileLabel');
      expect(await btn.evaluate((el) => el.tagName)).toBe('BUTTON');
      await page.locator('#sendCopy').focus();
      await page.keyboard.press('Tab');
      // the details summary sits between; tab until the button is focused
      for (let i = 0; i < 4; i++) {
        if (await btn.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(btn).toBeFocused();
      const chooser = page.waitForEvent('filechooser');
      await page.keyboard.press(key);
      expect(await chooser).toBeTruthy();
    });
  }

  test('answer radios are focusable and fillable by keyboard, arrows move within an item', async ({
    page,
  }) => {
    await gotoApp(page);
    const radio = page.locator('#q1_1');
    // not display:none - they have a box and take focus
    expect(await radio.evaluate((el) => window.getComputedStyle(el).display)).not.toBe('none');
    await radio.focus();
    await expect(radio).toBeFocused();
    await page.keyboard.press('Space');
    await expect(radio).toBeChecked();
    await page.keyboard.press('ArrowLeft'); // RTL: left = next
    const checked = await page.locator('input[name="q1"]:checked').getAttribute('id');
    expect(checked).not.toBe('q1_1');
    expect(checked.startsWith('q1_')).toBe(true);
    // focus ring on the label
    const outline = await page
      .locator(`label[for="${checked}"]`)
      .evaluate((el) => window.getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('a score row opens by Enter and Space, with aria-expanded', async ({ page }) => {
    await gotoApp(page);
    await calcWithResults(page);
    const row = page.locator('.score-row[data-drill="morning"]');
    expect(await row.getAttribute('role')).toBe('button');
    expect(await row.getAttribute('tabindex')).toBe('0');
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#drill_morning')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#drill_morning')).toBeHidden();
  });
});

test.describe('2. accessible names', () => {
  test('date selects and companion selects are named', async ({ page }) => {
    await gotoApp(page);
    const expected = {
      birthDay: 'יום לידה',
      birthMonth: 'חודש לידה',
      birthYear: 'שנת לידה',
      fillDay: 'יום מילוי',
      fillMonth: 'חודש מילוי',
      fillYear: 'שנת מילוי',
    };
    for (const [id, name] of Object.entries(expected)) {
      await expect(page.locator('#' + id)).toHaveAttribute('aria-label', name);
    }
    const titles = {
      morning: 'שגרות בוקר וערב',
      play: 'שגרות משחק ופנאי',
      social: 'שגרה חברתית',
    };
    for (const [k, t] of Object.entries(titles)) {
      await expect(page.locator('#companion_' + k)).toHaveAttribute(
        'aria-label',
        `מי נמצא עם הילד – ${t}`,
      );
    }
  });

  test('no form control (before or after results) lacks an accessible name', async ({ page }) => {
    await gotoApp(page);
    const unnamed = async () =>
      page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('input, select, textarea, button').forEach((el) => {
          if (el.type === 'hidden' || el.hidden || el.closest('[hidden]')) return;
          const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
          const byFor = el.id && document.querySelector(`label[for="${el.id}"]`);
          const wrapped = el.closest('label');
          const text = (el.tagName === 'BUTTON' ? el.textContent : '').trim();
          if (!(label || byFor || wrapped || text)) bad.push(el.id || el.name || el.tagName);
        });
        return bad;
      });
    expect(await unnamed()).toEqual([]);
    await calcWithResults(page);
    expect(await unnamed()).toEqual([]);
  });
});

test.describe('3. contrast', () => {
  test('the greyed texts reach 4.5:1', async ({ page }) => {
    await gotoApp(page);
    await calcWithResults(page);
    await page.locator('.score-row[data-drill="morning"]').click();
    const results = await page.evaluate(() => {
      const parse = (c) => c.match(/[\d.]+/g).map(Number);
      const lum = ([r, g, b]) => {
        const f = (v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bgOf = (el) => {
        for (let e = el; e; e = e.parentElement) {
          const c = parse(window.getComputedStyle(e).backgroundColor);
          if (c.length < 4 || c[3] > 0) return c.slice(0, 3);
        }
        return [255, 255, 255];
      };
      const sels = [
        '.header-subtitle',
        '.header-credit',
        '.header-lab',
        '.header-citation',
        '.results-meta',
        '.results-hint',
        '.summary-note',
        '.drill-item-tag',
        '.ef-note',
        '.item-num',
        '.save-indicator',
        '.progress-text',
        '.score-label .arrow',
      ];
      const out = [];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const fg = parse(window.getComputedStyle(el).color).slice(0, 3);
        const bg = bgOf(el);
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        out.push({ sel, ratio: (a + 0.05) / (b + 0.05) });
      }
      return out;
    });
    expect(results.length).toBeGreaterThan(8);
    for (const r of results) {
      expect(r.ratio, r.sel).toBeGreaterThanOrEqual(4.5);
    }
  });
});

test.describe('4. error texts', () => {
  test('E4 names the Hebrew field, never the code key', async ({ page }) => {
    await gotoApp(page);
    const names = {
      sex: 'מין',
      dob: 'תאריך לידה',
      date: 'תאריך מילוי',
      with: 'מי נמצא עם הילד',
      a: 'תשובות',
    };
    for (const [key, he] of Object.entries(names)) {
      const text = await page.evaluate((k) => window.importErrorText('E4', { key: k }), key);
      expect(text).toContain(he);
      expect(text).not.toMatch(/: (sex|dob|date|with|a)\./);
    }
  });

  test('E12 does not echo the raw value', async ({ page }) => {
    await gotoApp(page);
    const text = await page.evaluate(() => window.importErrorText('E12', { v: 'zzqq' }));
    expect(text).toBe('ערך לא תקין בשדה "מי נמצא עם הילד".');
  });

  test('E3: file wording for a file, paste wording for pasted text', async ({ page }) => {
    await gotoApp(page);
    await page.setInputFiles('#importFile', {
      name: 'answers.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(GOLDEN.BAD_SUM),
    });
    await expect(page.locator('#importStatus')).toHaveText(
      'הקובץ נפגם או נערך. בקש/י מההורים לשלוח אותו שוב.',
    );
    await page.locator('#importCode').fill(GOLDEN.BAD_SUM);
    await page.locator('#importCodeBtn').click();
    await expect(page.locator('#importStatus')).toContainText('הקוד השתנה או נקטע בדרך');
  });
});

test('5. a hint under the two PDF buttons', async ({ page }) => {
  await gotoApp(page);
  await calcWithResults(page);
  await expect(page.locator('#printHint')).toHaveText('ייפתח חלון הדפסה — בחר/י "שמירה כ-PDF".');
});

test('6. «הקישור הועתק ✓» clears after 5 seconds', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.install();
  await gotoApp(page);
  await page.locator('#sendCopy').click();
  await expect(page.locator('#sendStatus')).toHaveText('הקישור הועתק ✓');
  await page.clock.runFor(4000);
  await expect(page.locator('#sendStatus')).toHaveText('הקישור הועתק ✓');
  await page.clock.runFor(1500);
  await expect(page.locator('#sendStatus')).toHaveText('');
});
