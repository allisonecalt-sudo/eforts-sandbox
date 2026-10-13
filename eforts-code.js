/* exported EFORTSCode */
// Format EFORTS1 (§C in PF-spec-2026-09-28.md, AMENDED 2026-09-28 12:31 by
// Allison's direct instruction, relayed mid-build: no anonymous code/ID
// field at all, and date of birth instead of age-in-years+months. Fields:
// sex, dob (date of birth), date (fill date), with (companion codes),
// a (30 answers). The spec's original C.1-C.6 (age=Y;M + anon=) and its
// pinned golden strings no longer apply — see parent-form branch commit
// notes for what changed and why.
const EFORTSCode = (() => {
  const VERSION = 'EFORTS1';
  const ITEM_COUNT = 30;
  const KEYS = ['sex', 'dob', 'date', 'with', 'a'];
  const SEX_TO_CODE = { male: 'm', female: 'f' };
  const CODE_TO_SEX = { m: 'male', f: 'female' };
  const WITH_TO_CODE = { '': '-', mom: 'm', dad: 'd', both: 'b', other: 'o' };
  const CODE_TO_WITH = { '-': '', m: 'mom', d: 'dad', b: 'both', o: 'other' };
  const WITH_CODES = ['m', 'd', 'b', 'o', '-'];

  function checksum(payload) {
    let sum = 0;
    for (let i = 0; i < payload.length; i++) {
      sum = (sum + (i + 1) * payload.charCodeAt(i)) % 1296;
    }
    return sum.toString(36).padStart(2, '0');
  }

  function normalize(text) {
    return String(text)
      .replace(/[\s­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, '')
      .replace(/[‐-―−﹣－]/g, '-')
      .replace(/[｜¦∣]/g, '|');
  }

  function isRealDate(y, mo, d) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  function isValidDateStr(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  // Throws on any model that doesn't satisfy the shape below — encode() is
  // only ever called after the calling page has already validated the data
  // through its own UI (parent.js's #pFinish handler), so a throw here
  // means a programmer error, not a user-facing one.
  //   { sex: 'male'|'female', dob: 'YYYY-MM-DD', date: 'YYYY-MM-DD',
  //     with: { morning, play, social }, answers: [30 ints 1..5] }
  function validateModel(model) {
    if (!model || (model.sex !== 'male' && model.sex !== 'female')) {
      throw new Error('EFORTSCode.encode: invalid sex');
    }
    if (typeof model.dob !== 'string' || !isValidDateStr(model.dob)) {
      throw new Error('EFORTSCode.encode: invalid dob');
    }
    if (typeof model.date !== 'string' || !isValidDateStr(model.date)) {
      throw new Error('EFORTSCode.encode: invalid date');
    }
    const withKeys = ['morning', 'play', 'social'];
    if (
      !model.with ||
      !withKeys.every((k) => Object.prototype.hasOwnProperty.call(WITH_TO_CODE, model.with[k]))
    ) {
      throw new Error('EFORTSCode.encode: invalid with');
    }
    if (
      !Array.isArray(model.answers) ||
      model.answers.length !== ITEM_COUNT ||
      !model.answers.every((a) => Number.isInteger(a) && a >= 1 && a <= 5)
    ) {
      throw new Error('EFORTSCode.encode: invalid a');
    }
  }

  function encode(model) {
    validateModel(model);
    const payload = [
      VERSION,
      'sex=' + SEX_TO_CODE[model.sex],
      'dob=' + model.dob,
      'date=' + model.date,
      'with=' + ['morning', 'play', 'social'].map((k) => WITH_TO_CODE[model.with[k]]).join(','),
      'a=' + model.answers.join(','),
    ].join('|');
    return payload + '|k=' + checksum(payload);
  }

  function decode(text) {
    const clean = normalize(text);
    if (!clean) return { ok: false, error: 'E0', params: {} };

    const versions = clean.match(/EFORTS\d+\|/g);
    if (!versions) return { ok: false, error: 'E1', params: {} };
    if (!versions.includes(VERSION + '|')) {
      return { ok: false, error: 'E2', params: { found: versions[0].slice(0, -1) } };
    }

    const matches = clean.match(/EFORTS1\|(?:[a-z]+=[^|]*\|){5}k=[0-9A-Za-z]{2}/g);
    if (!matches) return { ok: false, error: 'E3', params: {} };

    const unique = [...new Set(matches)];
    if (unique.length > 1) return { ok: false, error: 'E13', params: {} };

    const code = unique[0];
    const payload = code.slice(0, code.lastIndexOf('|k='));
    const k = code.slice(-2).toLowerCase();
    if (checksum(payload) !== k) return { ok: false, error: 'E3', params: {} };

    const parts = payload.split('|').slice(1);
    for (let i = 0; i < KEYS.length; i++) {
      const eq = parts[i].indexOf('=');
      const key = parts[i].slice(0, eq);
      if (key !== KEYS[i]) return { ok: false, error: 'E4', params: { key: KEYS[i] } };
    }
    const val = (i) => parts[i].slice(parts[i].indexOf('=') + 1);

    const sexV = val(0);
    if (sexV !== 'm' && sexV !== 'f') return { ok: false, error: 'E5', params: { v: sexV } };

    const dobV = val(1);
    if (!isValidDateStr(dobV)) return { ok: false, error: 'E8', params: { v: dobV } };

    const dateV = val(2);
    if (!isValidDateStr(dateV)) return { ok: false, error: 'E9', params: { v: dateV } };

    const withV = val(3);
    const withParts = withV.split(',');
    if (withParts.length !== 3 || !withParts.every((w) => WITH_CODES.includes(w))) {
      return { ok: false, error: 'E12', params: { v: withV } };
    }

    const aV = val(4);
    const aParts = aV.split(',');
    if (aParts.length !== ITEM_COUNT) {
      return { ok: false, error: 'E6', params: { n: aParts.length } };
    }
    for (let i = 0; i < aParts.length; i++) {
      if (!/^[1-5]$/.test(aParts[i])) {
        return { ok: false, error: 'E7', params: { num: i + 1, v: aParts[i] } };
      }
    }

    const data = {
      sex: CODE_TO_SEX[sexV],
      dob: dobV,
      date: dateV,
      with: {
        morning: CODE_TO_WITH[withParts[0]],
        play: CODE_TO_WITH[withParts[1]],
        social: CODE_TO_WITH[withParts[2]],
      },
      answers: aParts.map(Number),
    };
    return { ok: true, code, data };
  }

  return {
    VERSION,
    ITEM_COUNT,
    KEYS,
    checksum,
    normalize,
    encode,
    decode,
    isValidDateStr,
  };
})();
