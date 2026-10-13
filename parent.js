// Parent companion page behavior. Reads items / SECTIONS / SCALE_LABELS /
// COMPANION from items.js and the codec from eforts-code.js — both are
// classic scripts loaded before this one, so their top-level `const`s live
// in the same shared script-realm scope (see items.js / eforts-code.js
// header comments). This file never loads app.js and carries no instrument
// text of its own (PF-spec-2026-09-28.md §B.7 / §F test 8).
//
// Fields collected (AMENDED 2026-09-28 12:31 by Allison, mid-build,
// overriding PF-spec §B/§C): sex, date of birth, and the 30 answers. No
// anonymous code/ID field at all — the email sender already identifies the
// family, and the therapist assigns her own anonymous number on import
// (PF2, a later run). See eforts-code.js's header comment for the format.
//
// Zero network: no fetch/XHR/beacon/socket/new-tab-opener anywhere below (the
// page's CSP also blocks connect-src at the browser level). The only
// "network-looking" thing this file does is build a
// blob: download — it does not leave the device until the parent acts on it.

const DRAFT_KEY = 'eforts_parent_draft_v1';
const DRAFT_MAX_AGE_MS = 14 * 24 * 3600 * 1000;

// ===== COPY (H.1 — the strings that vary; static text lives in parent.html) =====
const H_M0 = 'כדי לסיים, צריך להשלים עוד: ';
const H_S1 = 'מין הילד/ה';
const H_S2 = 'תאריך לידה';
const H_S2_VALID = 'תאריך לידה תקין';
const H_S3 = 'תשובות לשאלות {nums}';
const H_S3_MANY = 'עוד {n} שאלות';
const H_M0_MANY = 'כדי לסיים, צריך להשלים: ';
const H_GAP_ONE = 'חסרה תשובה אחת';
const H_GAP_MANY = 'חסרות {n} תשובות';
const H_GAP_DETAILS = 'חסרים פרטי הילד/ה';
const H_GAP_DETAILS_ONE = 'חסרים פרטי הילד/ה ועוד תשובה אחת';
const H_GAP_DETAILS_MANY = 'חסרים פרטי הילד/ה ועוד {n} תשובות';
const H_EVENING = 'שגרת ערב';
const H_MORNING = 'שגרת בוקר';
const H_S3_ONE = 'תשובה לשאלה {nums}';
const H_DOB_BAD = 'תאריך הלידה לא נראה תקין. בדקו אותו שוב.';
const H_DOB_NOSUCH = 'התאריך אינו קיים בלוח השנה.';
const H_DOB_AGE = 'השאלון מיועד לילדים בגילאי 3 עד 11. בדקו את תאריך הלידה.';
const H_D3 = 'למחוק את כל התשובות ששמרתם במכשיר הזה?';
// PDF send (2026-10-07): the answers travel as a PDF file the parent can send
// to ANY therapist by ANY channel. One main button. No email address and no
// copy-code backup on this page.
const H_P_SHARE = 'שליחת קובץ התשובות (PDF)';
const H_P_SHARE_HINT = 'בחרו מייל ושלחו את הקובץ לכתובת שקיבלתם מהמטפל/ת.';
const H_P_SHARED = '✓ נשלח? מצוין. כדאי למחוק את התשובות מהמכשיר (למטה).';
const H_P_SAVED_A = 'הקובץ ירד למכשיר (בדרך כלל לתיקיית ההורדות):';
const H_P_SAVED_B = 'עכשיו פתחו את המייל, צרפו את הקובץ ושלחו למטפל/ת.';
const H_P_DL = 'הורדת קובץ התשובות (PDF)';
const H_P_DL_HINT = 'צרפו את הקובץ למייל ושלחו לכתובת שקיבלתם מהמטפל/ת.';
const H_P_SHARE_TITLE = 'EFORTS';
const H_P_ERROR = 'לא הצלחנו ליצור את הקובץ. רעננו את הדף ונסו שוב.';

const state = {
  code: '',
  date: '',
  pdfFile: null,
  pdfPngs: [],
  pdfPromise: null,
  pdfFailed: false,
  model: null,
  canShare: false,
  attempted: false,
};
const JSPDF_SRC = 'assets/vendor/jspdf.umd.min.js';

// Elements are looked up once DOMContentLoaded fires (buildQuestionnaire()
// needs to run first for the pq{n} inputs to exist).
let pDraftBar,
  pDraftClear,
  pFormSection,
  pProgressFill,
  pProgressText,
  pDetails,
  pDobDay,
  pDobMonth,
  pDobYear,
  pDobError,
  pDobField,
  pSexField,
  pActions,
  pMissing,
  pFinish,
  pDone,
  pDoneTitle,
  pSend,
  pSendHint,
  pDownloadOnly,
  pSendError,
  pBack,
  pBarGap,
  pBarNote,
  pClearDone;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ===== QUESTIONNAIRE BUILD (§B.3 — DOM APIs only, no HTML-string building) =====
function buildQuestionnaire() {
  const container = document.getElementById('pQuestionnaire');
  SECTIONS.forEach((s) => {
    const section = document.createElement('div');
    section.className = 'section ' + s.key;

    const header = document.createElement('div');
    header.className = 'section-header';

    const h2 = document.createElement('h2');
    const dot = document.createElement('span');
    dot.className = 'dot';
    h2.appendChild(dot);
    h2.appendChild(document.createTextNode(s.title));
    header.appendChild(h2);

    const companionRow = document.createElement('div');
    companionRow.className = 'companion-row';
    const label = document.createElement('div');
    label.id = 'pWithLbl_' + s.key;
    label.className = 'companion-label';
    label.textContent = COMPANION.question;
    // four buttons in the בן/בת style; none chosen by default; tap again to unchoose
    const group = document.createElement('div');
    group.id = 'pWith_' + s.key;
    group.className = 'p-choice-row';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', label.id);
    COMPANION.options.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'p-choice';
      b.dataset.value = o.value;
      b.setAttribute('aria-pressed', 'false');
      b.textContent = o.label;
      group.appendChild(b);
    });
    companionRow.appendChild(label);
    companionRow.appendChild(group);
    header.appendChild(companionRow);
    section.appendChild(header);

    const instruction = document.createElement('div');
    instruction.className = 'section-instruction';
    instruction.textContent = s.instruction;
    section.appendChild(instruction);

    items
      .filter((it) => it.num >= s.range[0] && it.num <= s.range[1])
      .forEach((item) => {
        if (s.key === 'morning' && (item.num === 1 || item.num === 9)) {
          const div = document.createElement('div');
          div.className = 'sub-divider';
          div.textContent = item.num === 1 ? H_MORNING : H_EVENING;
          section.appendChild(div);
        }
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'p-item';
        fieldset.id = 'pItem' + item.num;

        const legend = document.createElement('legend');
        legend.className = 'p-item-text';
        const numSpan = document.createElement('span');
        numSpan.className = 'p-item-num';
        numSpan.textContent = item.num + '.';
        legend.appendChild(numSpan);
        legend.appendChild(document.createTextNode(' ' + item.text));
        fieldset.appendChild(legend);

        const scale = document.createElement('div');
        scale.className = 'p-scale';
        for (let v = 1; v <= 5; v++) {
          const input = document.createElement('input');
          input.type = 'radio';
          input.name = 'pq' + item.num;
          input.id = 'pq' + item.num + '_' + v;
          input.value = String(v);
          const lbl = document.createElement('label');
          lbl.setAttribute('for', input.id);
          lbl.textContent = SCALE_LABELS[v - 1];
          scale.appendChild(input);
          scale.appendChild(lbl);
        }
        fieldset.appendChild(scale);
        section.appendChild(fieldset);
      });

    container.appendChild(section);
  });
}

// ===== PROGRESS =====
function updateProgress() {
  let answered = 0;
  items.forEach((item) => {
    if (document.querySelector(`input[name="pq${item.num}"]:checked`)) answered++;
  });
  pProgressText.textContent = `${answered} / ${items.length}`;
  pProgressFill.style.width = (answered / items.length) * 100 + '%';
}

// Coming back to a saved draft: land on the first thing still to do, below
// the sticky progress bar (scroll-margin-top in parent.css).
function scrollToFirstGap() {
  let target = null;
  if (!sexChosen() || dobStatus()) target = pDetails;
  else {
    const firstOpen = items.find(
      (it) => !document.querySelector(`input[name="pq${it.num}"]:checked`),
    );
    target = firstOpen ? document.getElementById('pItem' + firstOpen.num) : pFinish;
  }
  target.scrollIntoView({ block: 'start' });
}

// ===== DRAFT (localStorage, §B.5) =====
function getWith(key) {
  const on = document.querySelector(`#pWith_${key} .p-choice[aria-pressed="true"]`);
  return on ? on.dataset.value : '';
}

function setWith(key, value) {
  document.querySelectorAll(`#pWith_${key} .p-choice`).forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.value === value ? 'true' : 'false');
  });
}

function withValues() {
  return { morning: getWith('morning'), play: getWith('play'), social: getWith('social') };
}

function saveDraft() {
  try {
    const sexChecked = document.querySelector('input[name="pSex"]:checked');
    const answers = {};
    items.forEach((it) => {
      const r = document.querySelector(`input[name="pq${it.num}"]:checked`);
      if (r) answers[it.num] = Number(r.value);
    });
    const with_ = withValues();
    const data = {
      v: 1,
      savedAt: Date.now(),
      sex: sexChecked ? sexChecked.value : '',
      dob: getDobIso(),
      with: with_,
      answers,
    };
    const hasValue =
      !!data.sex ||
      !!data.dob ||
      !!with_.morning ||
      !!with_.play ||
      !!with_.social ||
      Object.keys(answers).length > 0;
    if (!hasValue) {
      // an undo that emptied the form: do not keep the older, fuller draft
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable (private mode) — the page works without a draft
  }
}

function restoreDraft() {
  let raw;
  try {
    raw = localStorage.getItem(DRAFT_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!data || typeof data.savedAt !== 'number') return false;

  if (Date.now() - data.savedAt > DRAFT_MAX_AGE_MS) {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    return false;
  }

  if (data.sex) {
    const r = document.getElementById(data.sex === 'male' ? 'pSex_m' : 'pSex_f');
    if (r) r.checked = true;
  }
  if (data.dob) setDobIso(data.dob);
  if (data.with) {
    ['morning', 'play', 'social'].forEach((k) => {
      if (data.with[k]) setWith(k, data.with[k]);
    });
  }
  if (data.answers) {
    Object.entries(data.answers).forEach(([num, val]) => {
      const r = document.getElementById(`pq${num}_${val}`);
      if (r) r.checked = true;
    });
  }
  return true;
}

function clearDraftKey() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// ===== VALIDATION helpers =====
function sexChosen() {
  return !!document.querySelector('input[name="pSex"]:checked');
}

// ----- date of birth: three selects in Hebrew order (day, month, year) -----
// A native date input follows the BROWSER language (mm/dd on an English
// browser), so parents swap day and month. Three labelled selects cannot.
const H_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

function addOption(select, value, text) {
  const o = document.createElement('option');
  o.value = String(value);
  o.textContent = text;
  select.appendChild(o);
  return o;
}

function buildDobSelects() {
  const year = new Date().getFullYear();
  for (let d = 1; d <= 31; d++) addOption(pDobDay, d, String(d));
  H_MONTHS.forEach((name, i) => addOption(pDobMonth, i + 1, name));
  // newest first: this year - 3 down to this year - 12
  for (let y = year - 3; y >= year - 12; y--) addOption(pDobYear, y, String(y));
}

function dobParts() {
  return [pDobYear.value, pDobMonth.value, pDobDay.value];
}

// 'YYYY-MM-DD' when all three are chosen and the day exists in that month.
function getDobIso() {
  const [y, m, d] = dobParts();
  if (!y || !m || !d) return '';
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  if (dt.getMonth() !== Number(m) - 1 || dt.getDate() !== Number(d)) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Accepts the ISO strings older drafts stored (and '' to clear).
function setDobIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) {
    pDobDay.value = '';
    pDobMonth.value = '';
    pDobYear.value = '';
    return;
  }
  const y = String(Number(m[1]));
  if (![...pDobYear.options].some((o) => o.value === y)) {
    // outside the normal range: keep it so the age check can say so
    addOption(pDobYear, y, y);
    const sorted = [...pDobYear.options].slice(1).sort((a, b) => Number(b.value) - Number(a.value));
    sorted.forEach((x) => pDobYear.appendChild(x));
  }
  pDobYear.value = y;
  pDobMonth.value = String(Number(m[2]));
  pDobDay.value = String(Number(m[3]));
}

// '' = fine, 'empty' = not (fully) filled, 'nosuch' = a day that is not in
// that month (31 Feb), 'bad' = today/future, 'age' = outside 3-11.
function dobStatus() {
  const [y, m, d] = dobParts();
  if (!y || !m || !d) return 'empty';
  const v = getDobIso();
  if (!v) return 'nosuch';
  const today = localToday();
  if (v >= today || v < '1900-01-01') return 'bad';
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - Number(y);
  if (tm < Number(m) || (tm === Number(m) && td < Number(d))) age--;
  return age < 3 || age >= 12 ? 'age' : '';
}

function coarsePointer() {
  try {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch {
    return false;
  }
}

// Paints the date field's own error + highlight (live, on every change).
// A message only exists once all three selects are chosen, so nothing flashes
// while a parent is still picking.
function paintDob() {
  const st = dobStatus();
  const msg =
    st === 'bad' ? H_DOB_BAD : st === 'nosuch' ? H_DOB_NOSUCH : st === 'age' ? H_DOB_AGE : '';
  pDobError.textContent = msg;
  pDobError.hidden = !msg;
  pDobField.classList.toggle('p-field-missing', !!msg || (state.attempted && st === 'empty'));
}

// Re-reads the whole form. After the first "סיום" tap the missing message is
// kept in step with every change and hidden when nothing is missing.
function checkForm(scroll) {
  const sexOk = sexChosen();
  const dobSt = dobStatus();
  const missingItems = [];
  items.forEach((it) => {
    if (!document.querySelector(`input[name="pq${it.num}"]:checked`)) missingItems.push(it.num);
  });
  const problems = [];
  if (!sexOk) problems.push(H_S1);
  if (dobSt) problems.push(dobSt === 'empty' ? H_S2 : H_S2_VALID);
  const many = missingItems.length > 5;
  if (missingItems.length) {
    problems.push(
      many
        ? H_S3_MANY.replace('{n}', String(missingItems.length))
        : (missingItems.length === 1 ? H_S3_ONE : H_S3).replace('{nums}', missingItems.join(', ')),
    );
  }
  paintDob();
  pSexField.classList.toggle('p-field-missing', state.attempted && !sexOk);
  items.forEach((it) => {
    const el = document.getElementById('pItem' + it.num);
    if (el) el.classList.toggle('p-missing', state.attempted && missingItems.includes(it.num));
  });
  paintBarGap(missingItems.length, !sexOk || !!dobSt);
  if (!problems.length || !state.attempted) {
    pMissing.hidden = true;
    return { problems, sexOk, dobSt };
  }
  pMissing.textContent = (many ? H_M0_MANY : H_M0) + problems.join('; ');
  // only sex/date missing: the message sits right under the details card
  if (!missingItems.length) pDetails.insertAdjacentElement('afterend', pMissing);
  else pActions.insertAdjacentElement('beforebegin', pMissing);
  pMissing.hidden = false;
  if (scroll) {
    const target = !sexOk || dobSt ? pDetails : document.getElementById('pItem' + missingItems[0]);
    target.scrollIntoView({ behavior: 'smooth', block: missingItems.length ? 'center' : 'start' });
  }
  return { problems, sexOk, dobSt };
}

// The tappable "N answers missing" in the sticky bar (after a «סיום» with gaps).
function paintBarGap(nItems, detailsMissing) {
  const on = state.attempted && (nItems > 0 || detailsMissing);
  pBarGap.hidden = !on;
  if (!on) return;
  const one = detailsMissing ? H_GAP_DETAILS_ONE : H_GAP_ONE;
  const many = detailsMissing ? H_GAP_DETAILS_MANY : H_GAP_MANY;
  pBarGap.textContent =
    nItems === 0 ? H_GAP_DETAILS : nItems === 1 ? one : many.replace('{n}', String(nItems));
}

function jumpToGap(afterNum, detailsFirst) {
  const missing = items
    .map((it) => it.num)
    .filter((n) => !document.querySelector(`input[name="pq${n}"]:checked`));
  let target = null;
  if (detailsFirst && (!sexChosen() || dobStatus())) {
    target = pDetails;
  } else if (missing.length) {
    const next = missing.find((n) => n > (afterNum || 0)) || missing[0];
    target = document.getElementById('pItem' + next);
  } else if (!sexChosen() || dobStatus()) {
    target = pDetails;
  }
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadJsPdf() {
  if (window.jspdf) return Promise.resolve();
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = JSPDF_SRC;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

// ===== DONE SCREEN =====
function downloadAnswers() {
  const file = state.pdfFile;
  if (!file) return;
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  // say what happened and what to do next (the tap used to change nothing visible)
  pSendHint.textContent = '';
  pSendHint.classList.remove('p-ok');
  pSendHint.appendChild(document.createTextNode(H_P_SAVED_A));
  const name = document.createElement('bdi');
  name.dir = 'ltr';
  name.className = 'p-filename';
  name.textContent = file.name;
  pSendHint.appendChild(name);
  pSendHint.appendChild(document.createTextNode(H_P_SAVED_B));
}

// Web Share Level 2: only when this browser can share this very PDF.
function canShareFile(file) {
  try {
    if (!coarsePointer()) return false;
    if (typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare !== 'function') return false;
    return !!navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

// The PDF is built when the done screen opens, so the file is READY before
// any tap: navigator.share() needs the tap's user activation, which an await
// on a build inside the handler would lose.
function preparePdf(code, model) {
  state.model = model;
  state.pdfFailed = false;
  pSendError.hidden = true;
  state.pdfFile = null;
  state.pdfPngs = [];
  state.canShare = false;
  pSend.textContent = H_P_DL;
  pSendHint.textContent = H_P_DL_HINT;
  pDownloadOnly.hidden = true;
  const promise = Promise.resolve()
    .then(() => EFORTSPdf.build(code, model))
    .then(
      (res) => {
        if (state.pdfPromise !== promise) return;
        state.pdfFile = res.file;
        state.pdfPngs = res.pngs;
        if (canShareFile(res.file)) {
          state.canShare = true;
          pSend.textContent = H_P_SHARE;
          pSendHint.textContent = H_P_SHARE_HINT;
          pDownloadOnly.hidden = false;
        }
      },
      () => {
        // PDF could not be built: say so; a tap on the button retries the build
        if (state.pdfPromise !== promise) return;
        state.pdfFailed = true;
        pSendError.textContent = H_P_ERROR;
        pSendError.hidden = false;
      },
    );
  state.pdfPromise = promise;
  return promise;
}

function showDone(code, model) {
  state.code = code;
  state.date = model.date;

  preparePdf(code, model);

  state.attempted = false;
  pMissing.hidden = true;
  pFormSection.hidden = true;
  pDraftBar.hidden = true;
  pDone.hidden = false;
  window.scrollTo(0, 0);
  pDoneTitle.focus();
}

// ===== CLEAR (draft bar + done screen "delete answers") =====
function clearAll() {
  if (!confirm(H_D3)) return;

  clearDraftKey();

  document.querySelectorAll('input[type="radio"]').forEach((r) => {
    r.checked = false;
  });
  setDobIso('');
  ['morning', 'play', 'social'].forEach((k) => setWith(k, ''));

  state.attempted = false;
  pDraftBar.hidden = true;
  pDone.hidden = true;
  pFormSection.hidden = false;
  checkForm(false);

  updateProgress();
  window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  // ----- element lookups -----
  pDraftBar = document.getElementById('pDraftBar');
  pDraftClear = document.getElementById('pDraftClear');
  pFormSection = document.getElementById('pFormSection');
  pProgressFill = document.getElementById('pProgressFill');
  pProgressText = document.getElementById('pProgressText');
  pDetails = document.getElementById('pDetails');
  pDobDay = document.getElementById('pDobDay');
  pDobMonth = document.getElementById('pDobMonth');
  pDobYear = document.getElementById('pDobYear');
  pDobError = document.getElementById('pDobError');
  pDobField = document.getElementById('pDobField');
  pSexField = document.getElementById('pSexField');
  pActions = document.querySelector('#pFormSection .actions');
  pMissing = document.getElementById('pMissing');
  pFinish = document.getElementById('pFinish');
  pDone = document.getElementById('pDone');
  pDoneTitle = document.getElementById('pDoneTitle');
  pSend = document.getElementById('pSend');
  pSendHint = document.getElementById('pSendHint');
  pDownloadOnly = document.getElementById('pDownloadOnly');
  pSendError = document.getElementById('pSendError');
  pBack = document.getElementById('pBack');
  pBarGap = document.getElementById('pBarGap');
  pBarNote = document.getElementById('pBarNote');
  pClearDone = document.getElementById('pClearDone');

  buildDobSelects();

  // ----- build questionnaire (§B.3) -----
  buildQuestionnaire();

  // ----- draft restore (§B.5) -----
  const restored = restoreDraft();
  if (restored) pDraftBar.hidden = false;

  // ----- initial progress -----
  updateProgress();

  // ----- change handling (§B.4.5) -----
  pFormSection.addEventListener('change', (e) => {
    const m = e.target && e.target.name && /^pq(\d+)$/.exec(e.target.name);
    const wasMissing = m && document.getElementById('pItem' + m[1]).classList.contains('p-missing');
    updateProgress();
    saveDraft();
    checkForm(false);
    // after answering a highlighted item, move on to the next gap
    if (wasMissing && state.attempted) jumpToGap(Number(m[1]));
  });
  pFormSection.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('.p-choice');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') === 'true';
    b.parentElement.querySelectorAll('.p-choice').forEach((x) => {
      x.setAttribute('aria-pressed', 'false');
    });
    if (!on) b.setAttribute('aria-pressed', 'true');
    b.dispatchEvent(new Event('change', { bubbles: true }));
  });
  pBarGap.addEventListener('click', () => jumpToGap(0, true));
  checkForm(false);
  if (restored) {
    requestAnimationFrame(scrollToFirstGap);
    pBarNote.hidden = false;
    setTimeout(() => {
      pBarNote.hidden = true;
    }, 6000);
  }

  // ----- finish / validate (§B.4.6) -----
  pFinish.addEventListener('click', () => {
    state.attempted = true;
    const { problems } = checkForm(true);
    if (problems.length) return;

    const model = {
      sex: document.querySelector('input[name="pSex"]:checked').value,
      dob: getDobIso(),
      date: localToday(),
      with: withValues(),
      answers: items.map((it) =>
        Number(document.querySelector(`input[name="pq${it.num}"]:checked`).value),
      ),
    };
    const code = EFORTSCode.encode(model);
    showDone(code, model);
  });

  // ----- clear buttons -----
  pDraftClear.addEventListener('click', clearAll);
  document.getElementById('pReset').addEventListener('click', clearAll);
  pClearDone.addEventListener('click', clearAll);

  // ----- main button: share the prepared PDF (phones) or download it -----
  pSend.addEventListener('click', () => {
    const file = state.pdfFile;
    if (file && state.canShare) {
      // called synchronously inside the tap (user activation)
      navigator.share({ files: [file], title: H_P_SHARE_TITLE }).then(
        () => {
          pSendHint.textContent = H_P_SHARED;
          pSendHint.classList.add('p-ok');
        },
        (err) => {
          // User cancelled: keep the hint. Anything else: fall back to the file.
          if (!err || err.name !== 'AbortError') downloadAnswers();
        },
      );
      return;
    }
    if (file) {
      downloadAnswers();
      return;
    }
    // the build failed earlier: try again, then download
    if (state.pdfFailed && state.model) {
      loadJsPdf()
        .then(() => preparePdf(state.code, state.model))
        .then(downloadAnswers);
      return;
    }
    // not ready yet (rare): wait for the build, then download
    if (state.pdfPromise) state.pdfPromise.then(downloadAnswers);
  });
  pDownloadOnly.addEventListener('click', downloadAnswers);

  // ----- back (§B.4.11) -----
  pBack.addEventListener('click', () => {
    pDone.hidden = true;
    state.attempted = false;
    pMissing.hidden = true;
    pFormSection.hidden = false;
    pFinish.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});
