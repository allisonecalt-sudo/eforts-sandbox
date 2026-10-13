/* global DOMException, File, state, TextDecoder */
// The parent's answers as a PDF file: built on the done screen, sent/downloaded
// with one button, uploaded into the practitioner app (code read from the
// file's machine line), plus the paste auto-check and the F3 error.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { gotoApp } = require('./helpers/eforts-app');
const { gotoParent, fillParent, downloadPdf, GOLDEN, MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));
});

// where the main window looks at the sample outputs
const SAMPLE_DIR =
  'C:\\Users\\allis\\AppData\\Local\\Temp\\claude\\c--Users-allis-Documents-second-brain\\3e6155cf-15f5-49c4-87f9-6a9c67c7a402\\scratchpad';

async function finishParent(page, model = MODELS.G50) {
  await gotoParent(page);
  await fillParent(page, model);
  await page.locator('#pFinish').click();
  await expect(page.locator('#pDone')).toBeVisible();
}

async function readAppModel(page) {
  return page.evaluate(() => ({
    sex: document.getElementById('childGender').value,
    dob: getBirthDateValue(),
    date: getFillDateValue(),
    with: {
      morning: document.getElementById('companion_morning').value,
      play: document.getElementById('companion_play').value,
      social: document.getElementById('companion_social').value,
    },
    answers: items.map((it) => {
      const r = document.querySelector(`#questionnaire input[name="q${it.num}"]:checked`);
      return r ? Number(r.value) : 0;
    }),
  }));
}

// Builds a PDF inside a page that has the vendored jsPDF loaded (the parent
// page) — used for the compressed-stream and no-code cases.
async function makePdf(page, { text, compress }) {
  await gotoParent(page);
  const bytes = await page.evaluate(
    ({ t, c }) => {
      const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: c });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(t, 10, 20);
      return Array.from(new Uint8Array(doc.output('arraybuffer')));
    },
    { t: text, c: compress },
  );
  return Buffer.from(bytes);
}

test('a: parent finishes -> main button downloads the PDF; the code is in the file', async ({
  page,
}) => {
  await finishParent(page);
  await expect(page.locator('#pDoneLead')).toHaveText('נשאר רק לשלוח את התשובות למטפל/ת:');
  await expect(page.locator('#pSend')).toHaveText('הורדת קובץ התשובות (PDF)');
  await expect(page.locator('#pSendHint')).toHaveText(
    'צרפו את הקובץ למייל ושלחו לכתובת שקיבלתם מהמטפל/ת.',
  );
  await expect(page.locator('#pDownloadOnly')).toBeHidden();

  const pdf = await downloadPdf(page);
  expect(pdf.name).toBe('EFORTS-answers-2026-09-28-1000.pdf');
  const buf = fs.readFileSync(pdf.path);
  expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');

  const code = await page.evaluate((m) => EFORTSCode.encode(m), MODELS.G50);
  expect(code).toBe(GOLDEN.G50);
  const latin = buf.toString('latin1');
  expect(latin).toContain(code);
  // the Info dictionary carries it too (subject + keywords)
  expect(latin).toMatch(new RegExp('/Subject \\(' + code.replace(/[|]/g, '\\|') + '\\)'));
  expect(latin).toContain('/Title (EFORTS parent answers)');
  // no item wording and no name field in the file's text layer
  expect(latin).not.toContain('מתחיל ביוזמתו');

  // for the main window to look at
  try {
    fs.mkdirSync(SAMPLE_DIR, { recursive: true });
    fs.copyFileSync(pdf.path, path.join(SAMPLE_DIR, 'eforts-sample.pdf'));
    const png = await page.evaluate(() => state.pdfPngs[0]);
    fs.writeFileSync(
      path.join(SAMPLE_DIR, 'eforts-pdf-page1.png'),
      Buffer.from(png.replace(/^data:image\/png;base64,/, ''), 'base64'),
    );
  } catch {
    // sample outputs are a convenience only
  }
});

test('a2: the PDF is one A4 page for a normal fill, and not huge', async ({ page }) => {
  await finishParent(page, MODELS.WORST);
  const pdf = await downloadPdf(page);
  const buf = fs.readFileSync(pdf.path);
  const pages = (buf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  expect(pages).toBe(1);
  expect(buf.length).toBeLessThan(1500000);
  expect(buf.toString('latin1')).toContain(await page.evaluate(() => state.code));
});

test('b: upload the parent PDF in the practitioner app -> preview -> apply fills the form', async ({
  page,
}) => {
  await finishParent(page);
  const pdf = await downloadPdf(page);

  await gotoApp(page);
  await page.setInputFiles('#importFile', pdf.path);
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();
  await expect(page.locator('#importStatus')).toHaveClass(/ok/);

  const model = await readAppModel(page);
  expect(model).toEqual(MODELS.G50);
  expect(await page.evaluate((m) => EFORTSCode.encode(m), model)).toBe(GOLDEN.G50);
});

test('c: a PDF with compressed (Flate) streams imports through the inflate path', async ({
  page,
}) => {
  const buf = await makePdf(page, { text: GOLDEN.G50, compress: true });
  // the code is not readable in the raw bytes, so the Flate path is really used
  expect(buf.toString('latin1')).not.toContain('EFORTS1|');

  await gotoApp(page);
  await page.setInputFiles('#importFile', {
    name: 'compressed.pdf',
    mimeType: 'application/pdf',
    buffer: buf,
  });
  await expect(page.locator('#importPreview')).toBeVisible();
  await page.locator('#importAnon').fill('7');
  await page.locator('#importApply').click();
  expect(await readAppModel(page)).toEqual(MODELS.G50);
});

test('d: a PDF without a code shows F3', async ({ page }) => {
  const buf = await makePdf(page, { text: 'just some other document', compress: true });
  await gotoApp(page);
  await page.setInputFiles('#importFile', {
    name: 'other.pdf',
    mimeType: 'application/pdf',
    buffer: buf,
  });
  await expect(page.locator('#importPreview')).toBeHidden();
  await expect(page.locator('#importStatus')).toHaveClass(/err/);
  await expect(page.locator('#importStatus')).toHaveText(
    'לא נמצא קוד בקובץ. פתח/י את ה-PDF, העתק/י את שורת הקוד שבתחתית העמוד והדבק/י אותה כאן.',
  );
});

test('d2: a PDF with two different codes is rejected (E13), not guessed', async ({ page }) => {
  const buf = await makePdf(page, { text: GOLDEN.G50 + '   ' + GOLDEN.G32, compress: false });
  await gotoApp(page);
  await page.setInputFiles('#importFile', {
    name: 'two.pdf',
    mimeType: 'application/pdf',
    buffer: buf,
  });
  await expect(page.locator('#importPreview')).toBeHidden();
  await expect(page.locator('#importStatus')).toHaveClass(/err/);
  await expect(page.locator('#importStatus')).toContainText('כמה קודים שונים');
});

test('d3: a file named .pdf over 10 MB -> F1', async ({ page }) => {
  await gotoApp(page);
  await page.setInputFiles('#importFile', {
    name: 'big.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(10 * 1024 * 1024 + 10, 'a'),
  });
  await expect(page.locator('#importStatus')).toHaveClass(/err/);
  await expect(page.locator('#importStatus')).toContainText('גדול מדי');
});

test('f: pasting the code goes straight to the preview', async ({ page }) => {
  await gotoApp(page);
  await page.locator('#importCode').evaluate((el, code) => {
    el.value = code;
    el.dispatchEvent(new Event('paste', { bubbles: true }));
  }, GOLDEN.G50);
  await expect(page.locator('#importPreview')).toBeVisible();
  // typing alone does not auto-check; the button still does
  await page.locator('#importCancel').click();
  await expect(page.locator('#importPreview')).toBeHidden();
  await page.locator('#importCode').fill(GOLDEN.G50);
  await expect(page.locator('#importPreview')).toBeHidden();
  await page.locator('#importCodeBtn').click();
  await expect(page.locator('#importPreview')).toBeVisible();
});

test('g: phone path — share label, share gets one PDF File, the link downloads', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /pointer:\s*coarse/.test(q)
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
        : mm(q);
    navigator.share = async (d) => {
      window.__shared = d;
    };
  });
  await finishParent(page);
  await expect(page.locator('#pSend')).toHaveText('שליחת קובץ התשובות (PDF)');
  await expect(page.locator('#pSendHint')).toHaveText(
    'בחרו מייל ושלחו את הקובץ לכתובת שקיבלתם מהמטפל/ת.',
  );
  await expect(page.locator('#pDownloadOnly')).toBeVisible();
  await expect(page.locator('#pDownloadOnly')).toHaveText('או: הורדת הקובץ למכשיר');

  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('#pSend').click();
  const shared = await page.evaluate(async () => {
    const d = window.__shared;
    const f = d.files[0];
    return {
      count: d.files.length,
      isFile: f instanceof File,
      name: f.name,
      type: f.type,
      head: new TextDecoder('latin1').decode(new Uint8Array(await f.arrayBuffer()).slice(0, 4)),
      title: d.title,
    };
  });
  expect(shared).toMatchObject({
    count: 1,
    isFile: true,
    name: 'EFORTS-answers-2026-09-28-1000.pdf',
    type: 'application/pdf',
    head: '%PDF',
    title: 'EFORTS',
  });
  expect(downloads).toBe(0);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#pDownloadOnly').click();
  expect((await downloadPromise).suggestedFilename()).toBe('EFORTS-answers-2026-09-28-1000.pdf');
});

test('g2: share is called in the same tick as the tap (no await before it)', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /pointer:\s*coarse/.test(q)
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
        : mm(q);
    navigator.share = async () => {
      window.__sharedSync = navigator.userActivation ? navigator.userActivation.isActive : true;
    };
  });
  await finishParent(page);
  await expect(page.locator('#pSend')).toHaveText('שליחת קובץ התשובות (PDF)');
  await page.locator('#pSend').click();
  await expect.poll(() => page.evaluate(() => window.__sharedSync)).toBe(true);
});

test('share failure (not a cancel) falls back to the download', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /pointer:\s*coarse/.test(q)
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
        : mm(q);
    navigator.share = async () => {
      throw new DOMException('nope', 'NotAllowedError');
    };
  });
  await finishParent(page);
  await expect(page.locator('#pSend')).toHaveText('שליחת קובץ התשובות (PDF)');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#pSend').click();
  expect((await downloadPromise).suggestedFilename()).toBe('EFORTS-answers-2026-09-28-1000.pdf');
});
