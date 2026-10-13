// Locks eforts-code.js's EFORTSCode codec: pure encode/decode functions,
// tested via page.evaluate() on parent.html (no DOM, no network — see
// eforts-code.js's own header comment for the format, amended 2026-09-28
// mid-build to sex + date of birth only, no anonymous code/ID field).

const { test, expect } = require('@playwright/test');
const { gotoParent, GOLDEN, MODELS } = require('./helpers/eforts-parent');

test.use({ timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });

test.describe('EFORTSCode.encode', () => {
  for (const name of ['G50', 'G32', 'G50F', 'WORST']) {
    test(`encode(MODELS.${name}) === GOLDEN.${name}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));
      await gotoParent(page);
      const result = await page.evaluate((model) => EFORTSCode.encode(model), MODELS[name]);
      expect(result).toBe(GOLDEN[name]);
    });
  }
});

test.describe('EFORTSCode.decode — round trip', () => {
  for (const name of ['G50', 'G32', 'G50F', 'WORST']) {
    test(`decode(GOLDEN.${name}).data deep-equals MODELS.${name}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date('2026-09-28T10:00:00+03:00'));
      await gotoParent(page);
      const result = await page.evaluate((code) => EFORTSCode.decode(code), GOLDEN[name]);
      expect(result.ok).toBe(true);
      expect(result.data).toEqual(MODELS[name]);
    });
  }
});

test.describe('EFORTSCode.decode — errors', () => {
  test('empty text -> E0', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(() => EFORTSCode.decode(''));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E0');
  });

  test('no code at all -> E1', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(() => EFORTSCode.decode('hello'));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E1');
  });

  test('wrong version -> E2', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(
      (code) => EFORTSCode.decode(code),
      GOLDEN.G50.replace('EFORTS1', 'EFORTS2'),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E2');
    expect(result.params.found).toBe('EFORTS2');
  });

  test('truncated code -> E3', async ({ page }) => {
    await gotoParent(page);
    const truncated = GOLDEN.G50.slice(0, -20);
    const result = await page.evaluate((code) => EFORTSCode.decode(code), truncated);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E3');
  });

  test('checksum mismatch (BAD_SUM) -> E3', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate((code) => EFORTSCode.decode(code), GOLDEN.BAD_SUM);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E3');
  });

  test('29 answers (BAD_29) -> E6 n=29', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate((code) => EFORTSCode.decode(code), GOLDEN.BAD_29);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E6');
    expect(result.params.n).toBe(29);
  });

  test('answer value 6 (BAD_6) -> E7 num=1', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate((code) => EFORTSCode.decode(code), GOLDEN.BAD_6);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E7');
    expect(result.params.num).toBe(1);
    expect(result.params.v).toBe('6');
  });

  test('two different codes pasted together -> E13', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(
      (code) => EFORTSCode.decode(code),
      GOLDEN.G50 + ' ' + GOLDEN.G32,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E13');
  });

  test('same code pasted twice (quoted reply) -> ok', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(
      (code) => EFORTSCode.decode(code),
      GOLDEN.G50 + '\n' + GOLDEN.G50,
    );
    expect(result.ok).toBe(true);
    expect(result.code).toBe(GOLDEN.G50);
  });

  // Field-order / field-value errors: build a payload with the bad field
  // and a freshly-computed checksum, matching the codec's own algorithm.
  test('missing/misnamed field -> E4', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(() => {
      const payload = [
        'EFORTS1',
        'sex=m',
        'birthdate=2021-02-28', // wrong key name where "dob=" belongs
        'date=2026-09-28',
        'with=m,b,-',
        'a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2',
      ].join('|');
      return EFORTSCode.decode(payload + '|k=' + EFORTSCode.checksum(payload));
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E4');
    expect(result.params.key).toBe('dob');
  });

  test('invalid sex value -> E5', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(() => {
      const payload = [
        'EFORTS1',
        'sex=x',
        'dob=2021-02-28',
        'date=2026-09-28',
        'with=m,b,-',
        'a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2',
      ].join('|');
      return EFORTSCode.decode(payload + '|k=' + EFORTSCode.checksum(payload));
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E5');
    expect(result.params.v).toBe('x');
  });

  test('invalid date of birth -> E8', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(() => {
      const payload = [
        'EFORTS1',
        'sex=m',
        'dob=2021-13-40',
        'date=2026-09-28',
        'with=m,b,-',
        'a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2',
      ].join('|');
      return EFORTSCode.decode(payload + '|k=' + EFORTSCode.checksum(payload));
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E8');
    expect(result.params.v).toBe('2021-13-40');
  });

  test('invalid fill date -> E9', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(() => {
      const payload = [
        'EFORTS1',
        'sex=m',
        'dob=2021-02-28',
        'date=2026-02-30',
        'with=m,b,-',
        'a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2',
      ].join('|');
      return EFORTSCode.decode(payload + '|k=' + EFORTSCode.checksum(payload));
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E9');
    expect(result.params.v).toBe('2026-02-30');
  });

  test('invalid companion code -> E12', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate(() => {
      const payload = [
        'EFORTS1',
        'sex=m',
        'dob=2021-02-28',
        'date=2026-09-28',
        'with=x,b,-',
        'a=1,1,3,1,3,1,1,3,2,1,3,2,2,1,2,2,4,2,2,3,3,4,3,3,3,1,3,2,4,2',
      ].join('|');
      return EFORTSCode.decode(payload + '|k=' + EFORTSCode.checksum(payload));
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('E12');
    expect(result.params.v).toBe('x,b,-');
  });
});

test.describe('EFORTSCode.decode — survives mangling', () => {
  test('spaces, CRLF, RTL marks, fancy hyphens, BOM, glued Hebrew text', async ({ page }) => {
    await gotoParent(page);
    const result = await page.evaluate((code) => {
      let mangled = '';
      for (let i = 0; i < code.length; i++) {
        mangled += code[i];
        if ((i + 1) % 10 === 0) mangled += ' ';
        if ((i + 1) % 40 === 0) mangled += '\r\n';
      }
      mangled = mangled.replace(/\|/g, '|‏');
      mangled = mangled.replace(/-/g, '–');
      mangled = '﻿' + 'שלום, הנה הקוד: ' + mangled + ' תודה רבה!';
      return EFORTSCode.decode(mangled);
    }, GOLDEN.G50);
    expect(result.ok).toBe(true);
    expect(result.code).toBe(GOLDEN.G50);
  });
});
