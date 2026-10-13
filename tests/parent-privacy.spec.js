// Guards the parent page's privacy contract (PF-spec-2026-09-28.md §E):
// zero network from parent.html, nothing but the page's own files + blob:
// for the download, and the CSP meta present as a browser-level backstop.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  gotoParent,
  fillParent,
  downloadPdf,
  MODELS,
  REPO_URL,
} = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

test("runtime: no request/websocket leaves the page's own origin", async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));

  const urls = [];
  page.on('request', (req) => urls.push(req.url()));
  page.on('websocket', (ws) => urls.push(ws.url()));

  await gotoParent(page);
  await fillParent(page, MODELS.G50);
  await page.locator('#pFinish').click();

  await downloadPdf(page);

  const offending = urls.filter(
    (u) => !(u.startsWith(REPO_URL) || u.startsWith('blob:') || u.startsWith('data:')),
  );
  expect(offending).toEqual([]);
  const networky = urls.filter((u) => /^(https?|wss?):/.test(u) && !u.startsWith(REPO_URL));
  expect(networky).toEqual([]);
});

test('static source: no network-capable calls anywhere in the parent bundle', () => {
  const root = path.resolve(__dirname, '..');
  const files = [
    'parent.html',
    'parent.js',
    'parent-pdf.js',
    'parent.css',
    'items.js',
    'eforts-code.js',
  ];
  const banned = [
    'fetch(',
    'XMLHttpRequest',
    'sendBeacon',
    'WebSocket',
    'EventSource',
    'window.open',
    'http://',
    'https://',
    'fonts.googleapis',
    'innerHTML',
  ];

  for (const file of files) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    for (const needle of banned) {
      expect(content.includes(needle), `${file} should not contain "${needle}"`).toBe(false);
    }
  }
});

test('CSP meta is present with connect-src none', async ({ page }) => {
  await gotoParent(page);
  const csp = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return meta ? meta.getAttribute('content') : null;
  });
  expect(csp).not.toBeNull();
  expect(csp).toContain("connect-src 'none'");
});
