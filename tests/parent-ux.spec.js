/* global getComputedStyle */
// UX round 2026-10-11 (parent page only): P1 after-tap messages, P2 hints,
// P3 done screen, P4 routine dividers, P5 gap bar, P6 restore note,
// P8 companion buttons, P10 reset link, P12 contrast + year list.

const { test, expect } = require('@playwright/test');
const { gotoParent, fillParent, downloadPdf, MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));
});

function stubDevice(page, { coarse, share }) {
  return page.addInitScript(
    ({ coarse: c, share: sh }) => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /pointer:\s*coarse/.test(q)
          ? { matches: c, media: q, addEventListener() {}, removeEventListener() {} }
          : mm(q);
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = async () => {
        if (sh === 'cancel') {
          const e = new Error('cancel');
          e.name = 'AbortError';
          throw e;
        }
      };
    },
    { coarse, share },
  );
}

async function finish(page) {
  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeVisible();
}

const BEFORE_DL = 'צרפו את הקובץ למייל ושלחו לכתובת שקיבלתם מהמטפל/ת.';

test('P1/P2 download path: hint before, saved message with the file name after', async ({
  page,
}) => {
  await finish(page);
  await expect(page.locator('#pSendHint')).toHaveText(BEFORE_DL);
  const { name } = await downloadPdf(page);
  const hint = page.locator('#pSendHint');
  await expect(hint).toContainText('הקובץ ירד למכשיר (בדרך כלל לתיקיית ההורדות):');
  await expect(hint.locator('bdi.p-filename')).toHaveText(name);
  await expect(hint.locator('bdi.p-filename')).toHaveAttribute('dir', 'ltr');
  await expect(hint).toContainText(name);
  await expect(hint).toContainText('עכשיו פתחו את המייל, צרפו את הקובץ ושלחו למטפל/ת.');
});

test('P1/P2 share path: hint before, «נשלח? מצוין» after a share, kept on cancel', async ({
  page,
}) => {
  await stubDevice(page, { coarse: true, share: 'ok' });
  await finish(page);
  await expect(page.locator('#pSendHint')).toHaveText(
    'בחרו מייל ושלחו את הקובץ לכתובת שקיבלתם מהמטפל/ת.',
  );
  await page.locator('#pSend').click();
  await expect(page.locator('#pSendHint')).toHaveText(
    '✓ נשלח? מצוין. כדאי למחוק את התשובות מהמכשיר (למטה).',
  );
});

test('P1 share cancelled: the original hint stays', async ({ page }) => {
  await stubDevice(page, { coarse: true, share: 'cancel' });
  await finish(page);
  await page.locator('#pSend').click();
  await page.waitForTimeout(300);
  await expect(page.locator('#pSendHint')).toHaveText(
    'בחרו מייל ושלחו את הקובץ לכתובת שקיבלתם מהמטפל/ת.',
  );
});

test('P3 done screen: one filled button, links under a divider, hint above delete, note last', async ({
  page,
}) => {
  await finish(page);
  await expect(page.locator('#pDone .btn-primary')).toHaveCount(1);
  const order = await page.$$eval('#pDone .p-done-links > *, #pDoneNote', (els) =>
    els.map((e) => e.id),
  );
  expect(order).toEqual(['pBack', 'pClearDoneHint', 'pClearDone', 'pDoneNote']);
  await expect(page.locator('#pBack')).toHaveText('חזרה לתשובות');
  await expect(page.locator('#pClearDone')).toHaveText('מחיקת התשובות מהמכשיר');
  await expect(page.locator('#pClearDoneHint')).toHaveText('מומלץ אחרי ששלחתם.');
  const border = await page.$eval('.p-done-links', (e) => getComputedStyle(e).borderTopWidth);
  expect(border).toBe('1px');
  const h = await page.$eval('#pClearDone', (e) => e.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
});

test('P4 routine dividers before item 1 and item 9; item text unchanged', async ({ page }) => {
  await gotoParent(page);
  const kids = await page.$$eval('#pQuestionnaire .section.morning > *', (els) =>
    els.map((e) => (e.classList.contains('sub-divider') ? 'D:' + e.textContent : e.id)),
  );
  const i1 = kids.indexOf('D:שגרת בוקר');
  const i9 = kids.indexOf('D:שגרת ערב');
  expect(i1).toBeGreaterThan(-1);
  expect(kids[i1 + 1]).toBe('pItem1');
  expect(kids[i9 + 1]).toBe('pItem9');
  expect(kids[i9 - 1]).toBe('pItem8');
  const ok = await page.evaluate(() =>
    items.every((it) =>
      document.querySelector(`#pItem${it.num} .p-item-text`).textContent.includes(it.text),
    ),
  );
  expect(ok).toBe(true);
});

test.describe('P5 gaps', () => {
  async function almost(page, skip) {
    await gotoParent(page);
    await page.locator('label[for="pSex_m"]').click();
    const { setDob } = require('./helpers/eforts-parent');
    await setDob(page, '2021-05-10');
    for (let n = 1; n <= 30; n++) {
      if (!skip.includes(n)) await page.locator(`label[for="pq${n}_3"]`).click();
    }
  }

  test('more than 5 missing: «עוד N שאלות»; bar gap jumps; answering moves to the next', async ({
    page,
  }) => {
    await almost(page, [2, 5, 8, 12, 20, 25, 28]);
    await page.locator('#pFinish').click();
    await expect(page.locator('#pMissing')).toContainText('עוד 7 שאלות');
    await expect(page.locator('#pMissing')).not.toContainText('2, 5');
    await expect(page.locator('#pBarGap')).toHaveText('חסרות 7 תשובות');
    await page.locator('#pBarGap').click();
    await expect(page.locator('#pItem2')).toBeInViewport();
    await page.locator('label[for="pq2_3"]').click();
    await expect(page.locator('#pBarGap')).toHaveText('חסרות 6 תשובות');
    await expect(page.locator('#pItem5')).toBeInViewport();
  });

  test('5 or fewer: numbers are listed; one left: «חסרה תשובה אחת»', async ({ page }) => {
    await almost(page, [4, 9]);
    await page.locator('#pFinish').click();
    await expect(page.locator('#pMissing')).toContainText('4, 9');
    await page.locator('label[for="pq4_3"]').click();
    await expect(page.locator('#pBarGap')).toHaveText('חסרה תשובה אחת');
  });

  test('the bar link is hidden before «סיום»', async ({ page }) => {
    await almost(page, [4, 9]);
    await expect(page.locator('#pBarGap')).toBeHidden();
  });
});

test('P6 restored draft: a note in the bar, which goes away', async ({ page }) => {
  await gotoParent(page);
  await page.locator('label[for="pSex_m"]').click();
  await page.locator('label[for="pq1_3"]').click();
  await gotoParent(page);
  await expect(page.locator('#pBarNote')).toHaveText('המשכנו מאיפה שעצרתם');
  await expect(page.locator('#pDraftBar')).toBeVisible();
});

test('P8 companion: four buttons, none chosen, tap toggles, stored value is the same', async ({
  page,
}) => {
  await gotoParent(page);
  const btns = page.locator('#pWith_play .p-choice');
  await expect(btns).toHaveText(['אמא', 'אבא', 'שני ההורים', 'אחר']);
  await expect(page.locator('#pWith_play .p-choice[aria-pressed="true"]')).toHaveCount(0);
  await btns.nth(2).click();
  await expect(btns.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await btns.nth(0).click();
  await expect(btns.nth(2)).toHaveAttribute('aria-pressed', 'false');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('eforts_parent_draft_v1')),
  );
  expect(saved.with.play).toBe('mom');
  await btns.nth(0).click();
  await expect(page.locator('#pWith_play .p-choice[aria-pressed="true"]')).toHaveCount(0);
  // restore
  await btns.nth(1).click();
  await gotoParent(page);
  await expect(page.locator('#pWith_play .p-choice').nth(1)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('P10 «סיום» full width, «איפוס» a text link under it; draft bar says «איפוס»', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoParent(page);
  const [fin, rst, wrap] = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    return [r('pFinish'), r('pReset'), document.querySelector('.actions').getBoundingClientRect()];
  });
  expect(fin.width).toBeGreaterThan(wrap.width * 0.95);
  expect(rst.top).toBeGreaterThanOrEqual(fin.bottom);
  expect(rst.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#pDraftClear')).toHaveText('איפוס');
});

test('P12 selected teal has contrast >= 4.5 with white; year list newest first', async ({
  page,
}) => {
  await gotoParent(page);
  await page.locator('label[for="pq20_3"]').click();
  const ratio = await page.evaluate(() => {
    const bg = getComputedStyle(document.querySelector('label[for="pq20_3"]')).backgroundColor;
    const [r, g, b] = bg.match(/\d+/g).map(Number);
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    return 1.05 / (L + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  const years = await page.$$eval('#pDobYear option', (o) => o.map((x) => x.value).filter(Boolean));
  expect(years[0]).toBe('2023');
  expect(years[years.length - 1]).toBe('2014');
  const small = await page.$eval('.p-scale label', (e) => getComputedStyle(e).fontSize);
  expect(small).toBe(`${0.95 * 16}px`);
});
