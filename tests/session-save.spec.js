// The therapist page keeps the form in session storage only: it survives a
// reload in the same tab, vanishes with the tab, wipes the old localStorage
// copy, and asks before leaving while a form is in progress. Fake data only.

const { test, expect } = require('@playwright/test');
const { gotoApp, fillAndCalculate } = require('./helpers/eforts-app');

async function fillSome(page) {
  await page.fill('#anonId', '999');
  await page.locator('label[for="q1_3"]').click();
  await expect(page.locator('#progressText')).toHaveText('1 / 30');
}

test('a reload in the same tab restores the form', async ({ page }) => {
  await gotoApp(page);
  await fillSome(page);
  await page.reload();
  await page.waitForSelector('#questionnaire .item-row');
  expect(await page.locator('#anonId').inputValue()).toBe('999');
  await expect(page.locator('#progressText')).toHaveText('1 / 30');
  await expect(page.locator('#restoreBar')).toBeVisible();
  await expect(page.locator('#restoreText')).toHaveText("נטען השאלון שנשמר בלשונית זו (מס' 999).");
  await expect(page.locator('#saveIndicator')).toHaveText('נשמר זמנית בלשונית זו בלבד, עד לסגירתה');
});

test('a new browser context starts empty, with no resume bar', async ({ page, browser }) => {
  await gotoApp(page);
  await fillSome(page);
  const ctx = await browser.newContext();
  try {
    const page2 = await ctx.newPage();
    await gotoApp(page2);
    expect(await page2.locator('#anonId').inputValue()).toBe('');
    await expect(page2.locator('#progressText')).toHaveText('0 / 30');
    await expect(page2.locator('#restoreBar')).toBeHidden();
  } finally {
    await ctx.close();
  }
});

test('a new tab in the same browser starts empty too', async ({ page, context }) => {
  await gotoApp(page);
  await fillSome(page);
  const page2 = await context.newPage();
  await gotoApp(page2);
  expect(await page2.locator('#anonId').inputValue()).toBe('');
  await expect(page2.locator('#restoreBar')).toBeHidden();
});

test('an old localStorage copy is removed on load and never restored', async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() =>
    localStorage.setItem(
      'eforts_save',
      JSON.stringify({ anonId: '999', gender: 'male', answers: { 1: 3 } }),
    ),
  );
  await page.reload();
  await page.waitForSelector('#questionnaire .item-row');
  expect(await page.evaluate(() => localStorage.getItem('eforts_save'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('eforts_save'))).toBeNull();
  expect(await page.locator('#anonId').inputValue()).toBe('');
  await expect(page.locator('#restoreBar')).toBeHidden();
});

test('the page asks before leaving only while a form is in progress', async ({ page }) => {
  await gotoApp(page);
  // probe the registered handler with a synthetic event: no real navigation
  const probe = () =>
    page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  expect(await probe()).toBe(false);
  await fillSome(page);
  expect(await probe()).toBe(true);
});

test('after a reset the leave warning is off again', async ({ page }) => {
  await gotoApp(page);
  await fillSome(page);
  await page.evaluate(() => {
    window.confirm = () => true;
    window.resetForm();
  });
  const prevented = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(false);
});

test('a date of birth alone also counts as in progress', async ({ page }) => {
  await gotoApp(page);
  await page.selectOption('#birthYear', { index: 3 });
  const prevented = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented).toBe(true);
});

test('copy, downloads and print never navigate, so they never trigger the prompt', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await gotoApp(page);
  const scores = {};
  for (let i = 1; i <= 30; i++) scores[i] = 3;
  await fillAndCalculate(page, {
    sex: 'male',
    ageYearsBack: 6,
    ageMonthsBack: 0,
    itemScores: scores,
    anonId: '999',
  });
  await page.evaluate(() => {
    window.__leaveEvents = 0;
    window.addEventListener('beforeunload', () => (window.__leaveEvents += 1));
  });
  let navigations = 0;
  page.on('framenavigated', () => (navigations += 1));
  await page.locator('#copyClicks').click();
  const dl1 = page.waitForEvent('download');
  await page.locator('.btn-clicks').click();
  await dl1;
  const dl2 = page.waitForEvent('download');
  await page.evaluate(() => window.downloadForAI());
  await dl2;
  const popup = page.waitForEvent('popup');
  await page.locator('.btn-pdf').click();
  await (await popup).close();
  expect(await page.evaluate(() => window.__leaveEvents)).toBe(0);
  expect(navigations).toBe(0);
});
