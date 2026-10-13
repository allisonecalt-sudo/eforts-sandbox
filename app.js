const cutoffs = {
  '3-5': { morning: 2.45, play: 3.14, social: 2.71, total: 2.92, inh: 2.51, wm: 3.0, flex: 2.72 },
  '6-7': { morning: 2.74, play: 3.42, social: 2.85, total: 3.16, inh: 2.77, wm: 3.26, flex: 3.0 },
  '8-11': { morning: 2.76, play: 3.55, social: 3.04, total: 3.28, inh: 2.84, wm: 3.37, flex: 3.07 },
};

// ===== STATUS (TM-spec §B) =====
// One status per score, from the cutoff and nothing else. Every surface
// that names or colors a score (card value, gauge, status pill, print
// table, AI export) calls this. EF_CLOSE_MARGIN is the same 0.15 "close"
// line buildSummary's efStatus uses (canon B2); routines and the total
// stay binary (canon 0b#12).
const EF_CLOSE_MARGIN = 0.15;
function cutoffStatus(score, cutoff, kind) {
  if (score < cutoff) return { key: 'below', cls: 'warn', text: 'נמוך מציון החתך' };
  if (kind === 'ef' && score - cutoff <= EF_CLOSE_MARGIN) {
    return { key: 'close', cls: 'mid', text: 'קרוב לציון החתך' };
  }
  return { key: 'norm', cls: 'ok', text: 'בטווח הנורמה' };
}

// Strips buildSummary()'s HTML down to plain text. Shared by the print
// template and the AI export, so both carry the exact same summary text.
function summaryHtmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Gemini review item 8: anonId reaches several HTML sinks (results meta,
// buildSummary's own embed, the print meta) unescaped — self-XSS today,
// a real injection vector once anything parent-supplied fills this field.
// One escaper, applied at each call site (never inside buildSummary()
// itself, which the FX2 round owns) so every reader of anonId gets the
// same safe string.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

// Single source for reading the anonymous id — trims once, "where it's
// read" (item 8), instead of every caller repeating `.value.trim()`.
function getAnonId() {
  return document.getElementById('anonId').value.trim();
}

// Gemini review item 9: a below-cutoff score can round to the same
// 2-decimal string as its cutoff ("2.92 כאשר ציון החתך הוא 2.92") and
// still print "נמוך מציון החתך" — reads like a software bug. Reveal a
// 3rd decimal only in that exact collision; the comparison used for
// status (cutoffStatus) always stays on the raw, unrounded numbers.
// S2: round half-up on the exact value. A mean like 3.375 can sit a hair
// under in floating point and toFixed() would then print 3.37.
function round2(x) {
  return (Math.round((x + 1e-9) * 100) / 100).toFixed(2);
}
// S3: when score < cutoff and both show the same at 2 decimals, show the
// score FLOORED to 3 decimals (so it can never read as the cutoff); if
// that still equals the cutoff at 3 decimals, floor to 4.
function fmtScore(score, cutoff) {
  if (score < cutoff && round2(score) === cutoff.toFixed(2)) {
    const floorTo = (digits) => {
      const f = 10 ** digits;
      return (Math.floor(score * f + 1e-9) / f).toFixed(digits);
    };
    const three = floorTo(3);
    return three === cutoff.toFixed(3) ? floorTo(4) : three;
  }
  return round2(score);
}

// Item 17: shared by the drilldown badges (scoreRow) and the print item
// grouping, so "one item" never reads like a bare item number.
const nItems = (n) => (n === 1 ? 'פריט אחד' : `${n} פריטים`);

// FX2 (Gemini review item 4 + FX2-strength-nouns-spec §A): the 30 noun
// phrases named in מומלץ when a strength item is woven in, instead of the
// vague fallback "במשימות אחרות". Masculine and feminine are identical —
// the only gendered words stay in the frame (כוחותיו/כוחותיה, לו/לה) —
// so these plain strings carry no g(). Items n and n+8 (n = 1-8) share one
// noun on purpose (strengthNoun[n] === strengthNoun[n + 8]), so a twin pair
// can merge into one "בשגרת הבוקר והערב" entry (see strengthNounSlot below).
// Top-level (not inside buildSummary) so a test can call it via
// page.evaluate, per the spec.
const strengthNoun = {
  1: 'התנעה עצמאית',
  2: 'שמירה על קצב ללא תזכורות',
  3: 'זכירת רצף הפעילויות',
  4: 'התארגנות לפי כללי הבית',
  5: 'פתרון בעיות',
  6: 'התעלמות מגירויים מסיחים',
  7: 'הקפדה על איכות הביצוע',
  8: 'סיום פעילות לפני מעבר לאחרת',
  9: 'התנעה עצמאית',
  10: 'שמירה על קצב ללא תזכורות',
  11: 'זכירת רצף הפעילויות',
  12: 'התארגנות לפי כללי הבית',
  13: 'פתרון בעיות',
  14: 'התעלמות מגירויים מסיחים',
  15: 'הקפדה על איכות הביצוע',
  16: 'סיום פעילות לפני מעבר לאחרת',
  17: 'יוזמה',
  18: 'שמירה על קצב מתאים',
  19: 'התקדמות לפי סדר השלבים',
  20: 'הקפדה על הכללים',
  21: 'התמקדות',
  22: 'תכנון',
  23: 'סיום פעילות לפני מעבר לאחרת',
  24: 'יוזמה',
  25: 'למידה מהתנסויות',
  26: 'הימנעות מהבעה מוגזמת של כעס',
  27: 'השתתפות לפי כללי הקבוצה',
  28: 'פתרון בעיות',
  29: 'שקילת תגובות אפשריות',
  30: 'חשיבה לפני תגובה',
};
const NOUN_SUFFIX = {
  am: 'בשגרת הבוקר',
  pm: 'בשגרת הערב',
  ampm: 'בשגרת הבוקר והערב',
  play: 'במשחק',
  social: 'במצבים חברתיים',
};
// joinHe: 1 item -> "A", 2 -> "A וB", 3+ -> "A, B וC". Every part already
// starts with "ב", so the result reads "…וב…".
const joinHe = (parts) =>
  parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' ו' + parts[parts.length - 1];

// FX2-strength-nouns-spec §B: `woven` is the ordered list of item numbers
// the routine paragraphs already wove in as strengths (buildSummary pushes
// into it — see the eligibleStrong block below). This turns that same list
// into the מומלץ noun-phrase slot: group by context (am/pm/play/social),
// merging a morning/evening twin pair into one "ampm" entry, cap at 3,
// then join.
function strengthNounSlot(woven) {
  const ctxOf = (n) => (n <= 8 ? 'am' : n <= 16 ? 'pm' : n <= 23 ? 'play' : 'social');
  const entries = [];
  for (const n of woven) {
    if (n >= 9 && n <= 16 && woven.includes(n - 8)) continue; // merged into its morning twin
    entries.push({
      noun: strengthNoun[n],
      ctx: n <= 8 && woven.includes(n + 8) ? 'ampm' : ctxOf(n),
    });
  }
  const groups = [];
  for (const e of entries.slice(0, 3)) {
    let g = groups.find((x) => x.ctx === e.ctx);
    if (!g) groups.push((g = { ctx: e.ctx, nouns: [] }));
    g.nouns.push('ב' + e.noun);
  }
  return groups.length ? joinHe(groups.map((g) => joinHe(g.nouns) + ' ' + NOUN_SUFFIX[g.ctx])) : '';
}

// ===== BUILD FORM =====
function buildForm() {
  const container = document.getElementById('questionnaire');
  const routines = SECTIONS;

  const scaleLabels = SCALE_LABELS;

  routines.forEach((r) => {
    const section = document.createElement('div');
    section.className = `section ${r.key}`;

    let html = `<div class="section-header">
      <h2><span class="dot"></span>${r.title}</h2>
      <div class="companion-row">
        <span>מי נמצא עם הילד בדרך כלל בשגרות אלו:</span>
        <select id="companion_${r.key}" aria-label="מי נמצא עם הילד – ${r.title}">
          <option value="">—</option>
          <option value="mom">אמא</option>
          <option value="dad">אבא</option>
          <option value="both">שני ההורים</option>
          <option value="other">אחר</option>
        </select>
      </div>
    </div>`;
    html += `<div class="section-instruction">${r.instruction}</div>`;

    items
      .filter((it) => it.num >= r.range[0] && it.num <= r.range[1])
      .forEach((item) => {
        // Morning/evening divider between items 8 and 9
        if (r.key === 'morning' && item.num === 9) {
          html += `<div class="sub-divider">פריטי ערב</div>`;
        }
        const efNote =
          item.num === 10 || item.num === 11
            ? `<span class="ef-note">לא כלול בתפקודים הניהוליים</span>`
            : '';
        html += `<div class="item-row">
        <span class="item-num">${item.num}</span>
        <span class="item-text">${item.text}${efNote}</span>
        <div class="item-scores">`;
        for (let v = 1; v <= 5; v++) {
          html += `<input type="radio" name="q${item.num}" id="q${item.num}_${v}" value="${v}" onchange="updateProgress()">`;
          html += `<label for="q${item.num}_${v}">${scaleLabels[v - 1]}</label>`;
        }
        html += `</div>
        <span class="item-num">${item.num}</span>
      </div>`;
      });

    section.innerHTML = html;
    container.appendChild(section);
  });
}

// ===== PROGRESS =====
function updateProgress() {
  let answered = 0;
  items.forEach((item) => {
    if (document.querySelector(`input[name="q${item.num}"]:checked`)) answered++;
  });
  const pct = (answered / items.length) * 100;
  document.getElementById('progressFill').style.width = pct + '%';
  // Item 14: a bare "N / 30" is a count in RTL text — isolate it LTR so it
  // can't visually flip.
  document.getElementById('progressText').innerHTML =
    `<bdi dir="ltr">${answered} / ${items.length}</bdi>`;
}

// ===== AGE =====
// Item 7: every early return below must leave the same "nothing computed"
// state a fresh page load starts in — otherwise a date edited AFTER a
// valid age was already shown (e.g. the fill day briefly cleared while
// retyping) leaves the OLD age band sitting in the hidden #ageGroup input,
// and calculate() has no way to tell that band is stale.
function clearAgeDisplay() {
  const ageEl = document.getElementById('calcAge');
  ageEl.textContent = '—';
  ageEl.className = 'computed';
  const ageGroupDisplay = document.getElementById('ageGroupDisplay');
  ageGroupDisplay.textContent = '—';
  ageGroupDisplay.className = 'computed';
  document.getElementById('ageGroup').value = '';
}

// 31 Feb / 30 Feb / 31 Apr … exist in the dropdowns but not in the calendar.
function isoDateExists(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// One age wording for the form and the import preview: «3 שנים וחודש»,
// «4 שנים», «5 שנים ו-7 חודשים».
function ageWords(years, months) {
  const monthsText =
    months === 0
      ? ''
      : months === 1
        ? ' וחודש'
        : months === 2
          ? ' וחודשיים'
          : ` ו-${months} חודשים`;
  return `${years} שנים${monthsText}`;
}

function formatDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function updateAge() {
  const birthInput = getBirthDateValue();
  const fillInput = getFillDateValue();
  if (!birthInput || !fillInput || !isoDateExists(birthInput) || !isoDateExists(fillInput)) {
    clearAgeDisplay();
    return;
  }

  const birth = new Date(birthInput);
  const fill = new Date(fillInput);
  if (birth >= fill) {
    clearAgeDisplay();
    return;
  }

  let years = fill.getFullYear() - birth.getFullYear();
  let months = fill.getMonth() - birth.getMonth();
  if (fill.getDate() < birth.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalYears = years + months / 12;
  const ageEl = document.getElementById('calcAge');
  ageEl.textContent = ageWords(years, months);
  ageEl.className = 'computed';

  const ageGroupEl = document.getElementById('ageGroup');
  const ageGroupDisplay = document.getElementById('ageGroupDisplay');

  // Item 14: age-band ranges read left-to-right even inside Hebrew text —
  // isolate them so no browser/RTL context can flip the small/large ends.
  if (totalYears >= 3 && totalYears < 6) {
    ageGroupEl.value = '3-5';
    ageGroupDisplay.innerHTML = '<bdi dir="ltr">3.0 — 5.11</bdi>';
    ageGroupDisplay.className = 'computed valid';
  } else if (totalYears >= 6 && totalYears < 8) {
    ageGroupEl.value = '6-7';
    ageGroupDisplay.innerHTML = '<bdi dir="ltr">6.0 — 7.11</bdi>';
    ageGroupDisplay.className = 'computed valid';
  } else if (totalYears >= 8 && totalYears < 12) {
    ageGroupEl.value = '8-11';
    ageGroupDisplay.innerHTML = '<bdi dir="ltr">8.0 — 11.11</bdi>';
    ageGroupDisplay.className = 'computed valid';
  } else {
    ageGroupEl.value = '';
    ageGroupDisplay.innerHTML = 'מחוץ לטווח הגילים של השאלון (3 עד 11 שנים ו-11 חודשים)';
    ageGroupDisplay.className = 'computed invalid';
  }
}

// ===== SAVE / LOAD =====
// O4: a Clalit PC may block site storage; every access goes through these
// three so a blocked, full or disabled store can never stop the page.
// Session storage on purpose: the child's data lives only until this tab is
// closed, so the next person on a shared computer never sees it.
function storeGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function storeSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function storeRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // nothing to remove from
  }
}

// Older versions kept the form in localStorage. Wipe any such leftover (never
// migrated into the session) so a previous child's answers are gone.
function removeLegacySave() {
  try {
    localStorage.removeItem('eforts_save');
  } catch {
    // nothing to remove from
  }
}

// The OT's personal note to the parents lives in memory for this page
// session only (never storage, never the AI file) so it survives
// «חזרה לשאלון» → «חשב ציונים».
let parentNoteDraft = '';

function saveForm() {
  const data = {
    anonId: getAnonId(),
    gender: document.getElementById('childGender').value,
    birthDate: getBirthDateValue(),
    fillDate: getFillDateValue(),
    companions: {
      morning: document.getElementById('companion_morning')?.value || '',
      play: document.getElementById('companion_play')?.value || '',
      social: document.getElementById('companion_social')?.value || '',
    },
    answers: {},
  };
  items.forEach((item) => {
    const checked = document.querySelector(`input[name="q${item.num}"]:checked`);
    if (checked) data.answers[item.num] = parseInt(checked.value);
  });
  const saved = storeSet('eforts_save', JSON.stringify(data));
  const ind = document.getElementById('saveIndicator');
  ind.textContent = saved
    ? 'נשמר זמנית בלשונית זו בלבד, עד לסגירתה'
    : 'הדפדפן חוסם שמירה — הנתונים לא נשמרו';
  ind.classList.toggle('blocked', !saved);
}

// Restores the saved form and returns the saved data (or null when there is
// nothing usable: no storage or broken JSON).
function loadForm() {
  const raw = storeGet('eforts_save');
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    storeRemove('eforts_save');
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (data.anonId) document.getElementById('anonId').value = data.anonId;
  if (data.gender) document.getElementById('childGender').value = data.gender;
  if (data.birthDate) setBirthDateValue(data.birthDate);
  if (data.fillDate) setFillDateValue(data.fillDate);
  if (data.companions) {
    ['morning', 'play', 'social'].forEach((k) => {
      const el = document.getElementById('companion_' + k);
      if (el && data.companions[k]) el.value = data.companions[k];
    });
  }
  if (data.answers) {
    Object.entries(data.answers).forEach(([num, val]) => {
      const radio = document.getElementById(`q${num}_${val}`);
      if (radio) radio.checked = true;
    });
  }
  updateAge();
  updateProgress();
  return data;
}

// O2: reopening the page lands on the FORM (never on the last child's
// results). This bar says what was loaded and offers a fresh questionnaire.
function showRestoreBar(data) {
  const bar = document.getElementById('restoreBar');
  if (!bar) return;
  const hasContent =
    data &&
    (data.anonId ||
      data.birthDate ||
      data.gender ||
      (data.answers && Object.keys(data.answers).length > 0));
  if (!hasContent) {
    bar.hidden = true;
    return;
  }
  const id = String(data.anonId || '').trim();
  document.getElementById('restoreText').textContent =
    'נטען השאלון שנשמר בלשונית זו' + (id ? ` (מס' ${id}).` : '.');
  const complete =
    !!id &&
    !!data.gender &&
    !!data.birthDate &&
    !!data.fillDate &&
    !!data.answers &&
    Object.keys(data.answers).length === items.length;
  const showBtn = document.getElementById('restoreShow');
  if (showBtn) showBtn.hidden = !complete;
  bar.hidden = false;
}

function hideRestoreBar() {
  const bar = document.getElementById('restoreBar');
  if (bar) bar.hidden = true;
}

function populateBirthDropdowns() {
  const dayEl = document.getElementById('birthDay');
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    dayEl.appendChild(opt);
  }
  const yearEl = document.getElementById('birthYear');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 15; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearEl.appendChild(opt);
  }
}

function getBirthDateValue() {
  const d = document.getElementById('birthDay').value;
  const m = document.getElementById('birthMonth').value;
  const y = document.getElementById('birthYear').value;
  if (!d || m === '' || !y) return '';
  const mm = String(parseInt(m) + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function setBirthDateValue(dateStr) {
  if (!dateStr) return;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return;
  document.getElementById('birthYear').value = parseInt(parts[0]);
  document.getElementById('birthMonth').value = parseInt(parts[1]) - 1;
  document.getElementById('birthDay').value = parseInt(parts[2]);
}

function populateFillDropdowns() {
  const dayEl = document.getElementById('fillDay');
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    dayEl.appendChild(opt);
  }
  const yearEl = document.getElementById('fillYear');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 3; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearEl.appendChild(opt);
  }
}

function getFillDateValue() {
  const d = document.getElementById('fillDay').value;
  const m = document.getElementById('fillMonth').value;
  const y = document.getElementById('fillYear').value;
  if (!d || m === '' || !y) return '';
  const mm = String(parseInt(m) + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function setFillDateValue(dateStr) {
  if (!dateStr) return;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return;
  document.getElementById('fillYear').value = parseInt(parts[0]);
  document.getElementById('fillMonth').value = parseInt(parts[1]) - 1;
  document.getElementById('fillDay').value = parseInt(parts[2]);
}

function setFillDateToToday() {
  const now = new Date();
  document.getElementById('fillDay').value = now.getDate();
  document.getElementById('fillMonth').value = now.getMonth();
  document.getElementById('fillYear').value = now.getFullYear();
}

// True while anything has been entered (number, sex, birth date or an answer).
function formInProgress() {
  return !!(
    getAnonId() ||
    document.getElementById('childGender').value ||
    ['birthDay', 'birthMonth', 'birthYear'].some(
      (id) => document.getElementById(id).value !== '',
    ) ||
    document.querySelector('input[name^="q"]:checked')
  );
}

// Asks the browser for its own "leave the page?" prompt, only mid-form.
function warnBeforeLeaving(e) {
  if (!formInProgress()) return;
  e.preventDefault();
  e.returnValue = '';
}

document.addEventListener('DOMContentLoaded', () => {
  populateBirthDropdowns();
  populateFillDropdowns();
  buildForm();
  setFillDateToToday();
  removeLegacySave();
  showRestoreBar(loadForm());
  updateProgress();
  window.addEventListener('beforeunload', warnBeforeLeaving);
  document.getElementById('birthDay').addEventListener('change', updateAge);
  document.getElementById('birthMonth').addEventListener('change', updateAge);
  document.getElementById('birthYear').addEventListener('change', updateAge);
  document.getElementById('fillDay').addEventListener('change', updateAge);
  document.getElementById('fillMonth').addEventListener('change', updateAge);
  document.getElementById('fillYear').addEventListener('change', updateAge);

  // Auto-save on any change
  document.querySelectorAll('input[type="radio"]').forEach((r) => {
    r.addEventListener('change', () => {
      saveForm();
      updateProgress();
    });
  });
  document
    .querySelectorAll(
      '#anonId, #childGender, #birthDay, #birthMonth, #birthYear, #fillDay, #fillMonth, #fillYear, #companion_morning, #companion_play, #companion_social',
    )
    .forEach((el) => {
      el.addEventListener('change', saveForm);
    });

  // The OT's note to the parents: kept in memory only (see parentNoteDraft).
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'parentNote') parentNoteDraft = e.target.value;
  });
});

// ===== CALCULATE =====
// UX2-8: every empty required field, in page order.
function collectGaps() {
  const gaps = [];
  const empty = (ids) => ids.filter((id) => !document.getElementById(id).value);
  if (!getAnonId()) gaps.push({ label: 'מספר אנונימי', ids: ['anonId'] });
  if (!document.getElementById('childGender').value) {
    gaps.push({ label: 'מין', ids: ['childGender'] });
  }
  const b = empty(['birthDay', 'birthMonth', 'birthYear']);
  if (b.length) gaps.push({ label: 'תאריך לידה', ids: b });
  const f = empty(['fillDay', 'fillMonth', 'fillYear']);
  if (f.length) gaps.push({ label: 'תאריך מילוי', ids: f });
  const miss = items
    .filter((i) => !document.querySelector(`input[name="q${i.num}"]:checked`))
    .map((i) => i.num);
  if (miss.length) {
    gaps.push({
      label: `תשובות לפריטים: ${miss.join(', ')}`,
      ids: miss.map((n) => `q${n}_1`),
      rows: true,
    });
  }
  return gaps;
}

function showGaps(gaps) {
  if (gaps.some((g) => g.rows) && document.getElementById('questionnaire').hidden) setFold(false);
  const first = gaps[0];
  showWarning(`יש להשלים לפני החישוב — ${gaps.map((g) => g.label).join(' · ')}`, first.ids[0]);
  gaps.forEach((g) =>
    g.ids.forEach((id) => {
      const el = document.getElementById(id);
      const target = g.rows ? el.closest('.item-row') : el;
      if (!target) return;
      target.classList.add('field-invalid');
      if (!g.rows) el.setAttribute('aria-invalid', 'true');
    }),
  );
}

function calculate() {
  const gaps = collectGaps();
  if (gaps.length > 1) {
    showGaps(gaps);
    return;
  }
  const birthDate = getBirthDateValue();
  if (!birthDate) {
    showWarning(
      'יש להזין תאריך לידה לפני חישוב הציונים.',
      firstEmpty(['birthDay', 'birthMonth', 'birthYear']),
    );
    return;
  }
  // Item 7: the age band depends on the fill date as much as the birth
  // date. Refuse rather than silently scoring against a stale or missing
  // one (updateAge() clears #ageGroup on every early return, so a stale
  // band can no longer survive to here — this is the belt-and-braces
  // check for the fill date specifically, with its own message).
  if (!getFillDateValue()) {
    showWarning(
      'יש להזין תאריך מילוי לפני חישוב הציונים.',
      firstEmpty(['fillDay', 'fillMonth', 'fillYear']),
    );
    return;
  }
  if (!isoDateExists(birthDate) || !isoDateExists(getFillDateValue())) {
    showWarning('התאריך אינו קיים בלוח השנה.', isoDateExists(birthDate) ? 'fillDay' : 'birthDay');
    return;
  }
  if (birthDate > getFillDateValue()) {
    showWarning('תאריך הלידה מאוחר מתאריך המילוי.', 'birthDay');
    return;
  }
  const ageGroup = document.getElementById('ageGroup').value;
  if (!ageGroup) {
    showWarning(
      'הגיל מחוץ לטווח הגילים של השאלון (3 עד 11 שנים ו-11 חודשים) — לא ניתן לחשב ציונים',
      'birthDay',
    );
    return;
  }
  // F-15 / F-16 (TM-spec §C-F, optional — her yes): an unset sex silently
  // wrote the summary in female forms, and an empty anonymous number put
  // "—" into the summary as the child's stand-in noun. Fail loud instead.
  if (!document.getElementById('childGender').value) {
    showWarning(
      'יש לבחור מין לפני חישוב הציונים — הסיכום נכתב בלשון זכר או נקבה בהתאם.',
      'childGender',
    );
    return;
  }
  if (!getAnonId()) {
    showWarning('יש להזין מספר אנונימי — הוא מופיע בכותרת ובשמות הקבצים במקום שם.', 'anonId');
    return;
  }

  const scores = {};
  let missing = [];
  items.forEach((item) => {
    const checked = document.querySelector(`input[name="q${item.num}"]:checked`);
    if (checked) {
      scores[item.num] = parseInt(checked.value);
    } else {
      missing.push(item.num);
    }
  });

  if (missing.length > 0) {
    showMissingWarning(missing);
    return;
  }

  hideWarning();

  const morningItems = items.filter((i) => i.routine === 'morning').map((i) => scores[i.num]);
  const playItems = items.filter((i) => i.routine === 'play').map((i) => scores[i.num]);
  const socialItems = items.filter((i) => i.routine === 'social').map((i) => scores[i.num]);

  const morningAvg = avg(morningItems);
  const playAvg = avg(playItems);
  const socialAvg = avg(socialItems);
  const totalAvg = avg([morningAvg, playAvg, socialAvg]);

  const inhItems = items.filter((i) => i.ef === 'inh').map((i) => scores[i.num]);
  const wmItems = items.filter((i) => i.ef === 'wm').map((i) => scores[i.num]);
  const flexItems = items.filter((i) => i.ef === 'flex').map((i) => scores[i.num]);

  const inhAvg = avg(inhItems);
  const wmAvg = avg(wmItems);
  const flexAvg = avg(flexItems);

  const c = cutoffs[ageGroup];

  // Item 8: escape once, here, for every HTML sink this value reaches
  // below — the results meta line and buildSummary's own embed — without
  // touching buildSummary()'s body itself.
  const anonId = escapeHtml(getAnonId()) || '—';
  const ageText = document.getElementById('calcAge').textContent;
  const ageLabel = document.getElementById('ageGroupDisplay').textContent;
  const genderRaw = document.getElementById('childGender').value;
  const gender = genderText(genderRaw);
  const sexLabel = sexWord(genderRaw);
  // the age-band edge note from an import travels with the results
  const edgeEl = document.getElementById('importEdge');
  const edgeHtml =
    edgeEl && !edgeEl.hidden && edgeEl.textContent.trim()
      ? `<div class="results-edge">${escapeHtml(edgeEl.textContent.trim())}</div>`
      : '';
  const isMale = genderRaw === 'male';

  const routineGroups = {
    morning: { items: items.filter((i) => i.routine === 'morning') },
    play: { items: items.filter((i) => i.routine === 'play') },
    social: { items: items.filter((i) => i.routine === 'social') },
  };
  const efGroups = {
    inh: { items: items.filter((i) => i.ef === 'inh') },
    wm: { items: items.filter((i) => i.ef === 'wm') },
    flex: { items: items.filter((i) => i.ef === 'flex') },
  };

  // Hide form, show results. Item 13: the sticky progress bar has no
  // business sitting over a completed results screen — goBack()/
  // resetForm() bring it back.
  document.getElementById('formSection').style.display = 'none';
  document.getElementById('progressWrap').style.display = 'none';
  document.body.classList.add('showing-results');

  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = `
    <div class="results-header">
      <h2 id="resultsTitle" tabindex="-1">תוצאות שאלון EFORTS</h2>
      <div class="results-meta">${patientNoun(genderRaw)} מס' ${anonId} | ${sexLabel} | ${ageText} | קבוצת גיל: <bdi dir="ltr">${ageLabel}</bdi></div>
      ${edgeHtml}
      <div class="results-hint">לחצ/י על כל שורה כדי לראות פירוט הפריטים</div>
      <div class="score-legend" style="margin-top:12px;">
        <span class="score-legend-item"><span class="score-legend-dot" style="background:var(--green)"></span> בטווח הנורמה</span>
        <span style="margin:0 6px;">|</span>
        <span class="score-legend-item"><span class="score-legend-dot" style="background:var(--amber)"></span> קרוב לציון החתך (בתפקודים ניהוליים)</span>
        <span style="margin:0 6px;">|</span>
        <span class="score-legend-item"><span class="score-legend-dot" style="background:var(--red)"></span> נמוך מציון החתך</span>
        <span style="margin:0 6px;">|</span>
        <span>▌ = ציון החתך לקבוצת הגיל</span>
      </div>
    </div>

    <div class="score-group score-table">
      ${scoreHead('שגרה')}
      ${scoreRow('morning', 'בוקר וערב', morningAvg, c.morning, routineGroups.morning.items, scores, 'routine')}
      ${scoreRow('play', 'פנאי ומשחק', playAvg, c.play, routineGroups.play.items, scores, 'routine')}
      ${scoreRow('social', 'שגרה חברתית', socialAvg, c.social, routineGroups.social.items, scores, 'routine')}
      ${scoreRow('total', 'ציון כולל', totalAvg, c.total, [], scores, 'total')}
    </div>

    <div class="score-group score-table">
      ${scoreHead('תפקוד ניהולי')}
      ${scoreRow('inh', 'עכבה', inhAvg, c.inh, efGroups.inh.items, scores, 'ef')}
      ${scoreRow('wm', 'זיכרון עבודה', wmAvg, c.wm, efGroups.wm.items, scores, 'ef')}
      ${scoreRow('flex', 'גמישות מחשבתית', flexAvg, c.flex, efGroups.flex.items, scores, 'ef')}
    </div>

    <div class="summary-card">
      <div class="summary-head">
        <h3>סיכום קליני</h3>
        <button type="button" class="btn btn-primary btn-copy-clicks" id="copyClicks" onclick="copyClicksText()">העתקה לקליקס</button>
      </div>
      <p class="import-status" id="clicksStatus" role="status" aria-live="polite"></p>
      <button type="button" class="link-btn btn-clicks" onclick="downloadForClicks()">או: הורדה כקובץ טקסט (Notepad)</button>
      <p class="import-status" id="downloadStatus" role="status" aria-live="polite"></p>
      <div class="summary-text">${buildSummary({
        anonId,
        gender,
        isMale,
        sexUnset: !genderRaw,
        ageText,
        ageLabel,
        morningAvg,
        playAvg,
        socialAvg,
        totalAvg,
        inhAvg,
        wmAvg,
        flexAvg,
        c,
        scores,
      })}</div>
      <div class="summary-note">
        ציון החתך נקבע 1.5 סטיות תקן מתחת לממוצע של קבוצת הגיל (Frisch & Rosenblum, 2024). ציון נמוך מציון החתך מורה על חשד לקושי בתחום שנמדד בלבד: בשגרה או בתפקוד הניהולי.
        <br>הציון הכולל הוא ממוצע שלושת ציוני השגרות. פריטים 10 ו-11 אינם נכללים בחישוב התפקודים הניהוליים.
      </div>
    </div>

    <div class="result-actions">
      <button class="btn btn-pdf" onclick="printResults()">PDF למטפל/ת</button>
      <p class="print-hint" id="printHint">ייפתח חלון הדפסה — בחר/י "שמירה כ-PDF".</p>

      <div class="parent-box">
        <div class="parent-box-title">דף להורים</div>
        <label class="parent-box-label" for="parentNote">הערה אישית (לא חובה) — תופיע בדף להורים</label>
        <textarea id="parentNote" rows="2" dir="auto" placeholder="למשל: דבר אחד לנסות בבית"></textarea>
        <label class="parent-box-label" for="parentContact">פרטי קשר להורים (לא חובה) — למשל טלפון של המכון</label>
        <input type="text" id="parentContact" dir="auto" autocomplete="off" />
        <button class="btn btn-parent-pdf" onclick="printParentResults()">PDF להורים</button>
        <div class="parent-box-hint">מומלץ למסור להורים בפגישה או מיד אחריה.</div>
      </div>

      <div class="link-row">
        <div class="link-col">
          <button type="button" class="link-btn btn-ai" onclick="downloadForAI()">הורדה ל-AI (טקסט)</button>
          <p class="import-status" id="aiStatus" role="status" aria-live="polite"></p>
        </div>
        <div class="link-col">
          <button type="button" class="link-btn btn-back" onclick="goBack()">חזרה לשאלון</button>
        </div>
      </div>
      <details class="ai-help">
        <summary>מה עושים עם קובץ ה-AI?</summary>
        <p>לשילוב ממצאי השאלון עם התמונה הקלינית מהמפגש: לחצ/י על "הורדה ל-AI (טקסט)", העל/י את הקובץ לכלי AI (Claude, ChatGPT, Copilot) ותאר/י לו מה נצפה. הכלי יכתוב רק את פסקת המטפל/ת, בלי לשנות ציונים או את הסיכום. אין להוסיף שם או ת״ז.</p>
      </details>

      <button class="btn btn-new" onclick="resetForm()">שאלון חדש — לילד/ה הבא/ה</button>
    </div>
  `;
  document.getElementById('parentNote').value = parentNoteDraft;

  resultsDiv.style.display = 'block';
  scrollToResults();
}

// O3: land on «תוצאות שאלון EFORTS», not the page top.
function scrollToResults() {
  const h = document.getElementById('resultsTitle');
  if (!h) return;
  const top = h.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}

function scoreHead(first) {
  return `<div class="score-head" aria-hidden="true"><span>${first}</span><span>ציון</span><span>ציון החתך</span><span>מצב</span></div>`;
}

function scoreRow(id, label, score, cutoff, cardItems, scores, type) {
  const st = cutoffStatus(score, cutoff, type);
  const hasDetails = cardItems.length > 0;

  // Gauge: score position on 1-5 scale
  const pct = ((score - 1) / 4) * 100;
  const cutoffPct = ((cutoff - 1) / 4) * 100;

  // Drilldown
  let drillHtml = '';
  if (hasDetails) {
    const efLabels = { inh: 'עכבה', wm: 'זיכרון עבודה', flex: 'גמישות מחשבתית' };
    const routineLabels = { morning: 'בוקר וערב', play: 'פנאי ומשחק', social: 'שגרה חברתית' };
    const sorted = [...cardItems].sort((a, b) => scores[a.num] - scores[b.num]);
    const weak = sorted.filter((i) => scores[i.num] <= 2);
    const mid = sorted.filter((i) => scores[i.num] === 3);
    const strong = sorted.filter((i) => scores[i.num] >= 4);

    drillHtml = `<div class="drilldown" id="drill_${id}">
      <div class="drill-summary">
        <span class="drill-badge weak">ציון 1–2: ${nItems(weak.length)}</span>
        <span class="drill-badge mid">ציון 3: ${nItems(mid.length)}</span>
        <span class="drill-badge strong">ציון 4–5: ${nItems(strong.length)}</span>
      </div>`;

    sorted.forEach((item) => {
      const s = scores[item.num];
      const rowCls = s <= 2 ? 'weak' : s === 3 ? 'mid' : 'strong';
      const tag =
        type === 'routine'
          ? item.ef
            ? efLabels[item.ef]
            : 'לא כלול'
          : routineLabels[item.routine];
      const dots = [1, 2, 3, 4, 5]
        .map((v) => `<span class="drill-dot ${v === s ? 'active-' + rowCls : ''}">${v}</span>`)
        .join('');

      drillHtml += `<div class="drill-item ${rowCls}-row">
        <span class="drill-item-num">${item.num}</span>
        <span class="drill-item-text">${item.text}</span>
        <span class="drill-item-tag">${tag}</span>
        <div class="drill-dots">${dots}</div>
      </div>`;
    });
    drillHtml += `</div>`;
  }

  // S-09: explains the cutoff, not the deleted absolute bands.
  const tipScope = {
    routine: 'ממוצע הפריטים בשגרה זו',
    total: 'ממוצע שלושת ציוני השגרות',
    ef: 'ממוצע הפריטים של תפקוד זה בשלוש השגרות (בלי פריטים 10 ו-11)',
  }[type];
  const tipBelow = {
    routine: 'חשד לקושי בשגרה זו',
    total: 'חשד לקושי בניהול העצמי של שגרות היום-יום',
    ef: 'חשד לקושי בתפקוד ניהולי זה',
  }[type];
  const scoreTip =
    `${tipScope}, בסולם 1–5 (ככל שהציון גבוה יותר, התפקוד טוב יותר).\n` +
    `ציון החתך לקבוצת הגיל: ${cutoff.toFixed(2)}\n` +
    `נמוך מציון החתך: ${tipBelow}.` +
    (type === 'ef' ? `\nקרוב לציון החתך: עד 0.15 מעליו.` : '');

  return `<div class="score-row ${hasDetails ? '' : 'no-drill'}" ${hasDetails ? `role="button" tabindex="0" aria-expanded="false" aria-controls="drill_${id}" aria-label="${label}: ${fmtScore(score, cutoff)} — פירוט הפריטים" data-drill="${id}" onclick="toggleDrill('${id}')" onkeydown="drillKey(event, '${id}')"` : ''}>
    <div class="score-label">${label} ${hasDetails ? `<span class="arrow" id="arrow_${id}">&#9660;</span>` : ''}
      <span class="info-tip" tabindex="0" onclick="event.stopPropagation()">?<span class="tip-content">${scoreTip}</span></span>
      <div class="gauge">
        <div class="gauge-fill ${st.cls}" style="width:${pct}%"></div>
        <div class="gauge-cutoff" style="right:${cutoffPct}%" data-label="חתך ${cutoff.toFixed(2)}"></div>
      </div>
    </div>
    <div class="score-value ${st.cls}">${fmtScore(score, cutoff)}</div>
    <div class="score-interp">${cutoff.toFixed(2)}</div>
    <div class="score-status-cell"><span class="score-status ${st.cls}">${st.text}</span></div>
  </div>
  ${drillHtml}`;
}

// Per-item phrasings, shared by buildSummary (clinical) and the parent
// sheet. diffPhrase = difficulty direction (score 1-2), strengthPhrase =
// strength direction (score 4-5). isMale picks the gendered forms.
function itemPhrases(isMale) {
  const g = (male, female) => (isMale ? male : female);
  // Short clinical phrasings per item — difficulty direction (score 1-2)
  const diffPhrase = {
    1: 'מתקשה להתניע את שגרת הבוקר באופן עצמאי',
    2: `${g('זקוק', 'זקוקה')} לתזכורות חוזרות כדי לשמור על קצב`,
    3: 'מתקשה לזכור את רצף הפעילויות',
    4: 'מתקשה להתארגן על פי כללי הבית',
    5: 'מתקשה לפתור בעיות שמתעוררות במהלך השגרה',
    6: `${g('מוסח', 'מוסחת')} מגירויים חיצוניים ורעשי רקע`,
    7: 'מתקשה להקפיד על איכות הביצוע',
    // canon B3 twins table: 8↔16 are the same content ("finishes without
    // switching") and must share one phrase so the twin-merge (below) can
    // fire for them — before this fix they had different text and never merged.
    8: `${g('עובר', 'עוברת')} לפעילות אחרת באמצע, מבלי לסיים את הקודמת`,
    9: 'מתקשה להתניע את שגרת הערב באופן עצמאי',
    10: `${g('זקוק', 'זקוקה')} לתזכורות חוזרות כדי לשמור על קצב בערב`,
    11: 'מתקשה לזכור את רצף פעילויות הערב',
    12: 'מתקשה להתארגן על פי כללי הבית',
    13: 'מתקשה לפתור בעיות שמתעוררות במהלך השגרה',
    14: `${g('מוסח', 'מוסחת')} מגירויים חיצוניים ורעשי רקע`,
    15: 'מתקשה לשים לב לאיכות הביצוע',
    16: `${g('עובר', 'עוברת')} לפעילות אחרת באמצע, מבלי לסיים את הקודמת`,
    17: 'מתקשה ליזום בחירת משחק',
    18: 'מתקשה לשחק בקצב מתאים',
    19: 'מתקשה להחזיק רצף פעילות ולשחק לפי שלבי המשחק בסדר הנכון',
    20: 'מתקשה לשחק לפי כללי המשחק, כמו להמתין לתור',
    21: `מתקשה להישאר ${g('ממוקד', 'ממוקדת')} במשחק אחד`,
    22: 'מתקשה לעצור ולתכנן לפני המשחק',
    23: `${g('עובר', 'עוברת')} ממשחק למשחק מבלי לסיים`,
    24: 'מתקשה ליזום אינטראקציה חברתית',
    25: 'מתקשה ללמוד מהתנסות חברתית שלילית',
    26: `${g('מביע', 'מביעה')} כעס או תסכול באופן מוגזם`,
    27: 'מתקשה להשתתף במשחק לפי כללי הקבוצה',
    28: 'מתקשה לפתור בעיות שעולות במשחק חברתי',
    29: `${g('מגיב', 'מגיבה')} מבלי לשקול מספר תגובות אפשריות`,
    30: `${g('מגיב', 'מגיבה')} לפני ש${g('עוצר', 'עוצרת')} לחשוב`,
  };

  // Strength direction (score 4-5).
  // canon F-36 / FX1 re-check: every phrase is an INFINITIVE, governed by one
  // "מצליח/ה" that the frame supplies ("והוא מצליח ליזום… וכן לתכנן…", Carmit's
  // C50 form). Infinitives carry no gender; only suffixes/participles do.
  const strengthPhrase = {
    1: 'להתניע את שגרת הבוקר באופן עצמאי',
    2: 'לשמור על קצב ללא תזכורות',
    3: 'לזכור את רצף הפעילויות',
    4: 'להתארגן לפי כללי הבית',
    5: 'לפתור בעיות שצצות במהלך השגרה',
    6: 'להתעלם מגירויים מסיחים',
    7: 'להקפיד על איכות הביצוע',
    8: `לסיים פעילויות ש${g('התחיל', 'התחילה')}`,
    9: 'להתניע את שגרת הערב באופן עצמאי',
    10: 'לשמור על קצב בפעילויות הערב',
    11: 'לזכור את רצף פעילויות הערב',
    12: 'להתארגן לפי כללי הבית בערב',
    13: 'לפתור בעיות שצצות במהלך השגרה',
    14: 'להתעלם מגירויים מסיחים',
    15: 'לשים לב לאיכות הביצוע',
    16: 'לסיים פעילויות מבלי לעבור באמצע לאחרות',
    17: 'ליזום בחירת משחק',
    18: 'לשחק בקצב מתאים',
    19: 'לשחק לפי שלבי המשחק',
    20: 'לשחק לפי כללי המשחק',
    21: `להישאר ${g('ממוקד', 'ממוקדת')} במשחק`,
    22: `לתכנן את ${g('פעולותיו', 'פעולותיה')} מראש`,
    23: 'לסיים משחק אחד לפני מעבר לאחר',
    24: 'ליזום אינטראקציה חברתית',
    25: 'ללמוד מהתנסויות חברתיות',
    26: 'להימנע מהבעה מוגזמת של כעס במשחק חברתי',
    27: 'להשתתף במשחק לפי כללי הקבוצה',
    28: 'לפתור בעיות שעולות במשחק חברתי',
    29: `לשקול תגובות אפשריות לפני ש${g('מגיב', 'מגיבה')}`,
    30: `לחשוב על השפעת ${g('תגובותיו על חבריו', 'תגובותיה על חברותיה')}`,
  };
  return { diffPhrase, strengthPhrase };
}

// canon B3: morning/evening twin pairs (items 1-16 only).
const ITEM_TWIN = { 1: 9, 9: 1, 4: 12, 12: 4, 5: 13, 13: 5, 6: 14, 14: 6, 8: 16, 16: 8 };

function buildSummary(d) {
  const belowCutoff = (s, c) => s < c;
  const m = d.isMale;
  const g = (male, female) => (m ? male : female);
  const hisAge = g('גילו', 'גילה');
  const got = g('קיבל', 'קיבלה');
  // canon C4: never "הילד/הילדה". Her ruling 2026-10-09: the anonymous
  // number is NOT written inside summary sentences (it stays in the results
  // header, the print header, the AI file's details line and file names);
  // pronouns / possessive suffixes cover it. Sex unset -> slash forms.
  const hisMotivation = d.sexUnset
    ? 'גיוס המוטיבציה שלו/שלה'
    : g('גיוס המוטיבציה שלו', 'גיוס המוטיבציה שלה');

  const { diffPhrase, strengthPhrase } = itemPhrases(m);

  const efNames = { wm: 'זיכרון עבודה', inh: 'עכבה', flex: 'גמישות מחשבתית' };
  // FX1-r2 fix 3: definite-article forms, used only when a strength
  // sentence is framed through its EF ("בתחום ה...", Carmit's C50 form).
  const efNamesDef = { wm: 'זיכרון העבודה', inh: 'העכבה', flex: 'הגמישות המחשבתית' };

  // canon B3: morning/evening twin pairs that may be cited together in one
  // clause when both are weak (or the non-anchor twin scores exactly 3 —
  // rule 7, "a 3 may ride along"). 2↔10, 3↔11 are excluded because 10/11
  // carry no EF; 7↔15 is excluded because the two items sit under different
  // EFs. Only items 1-16 (morning/evening) have twins at all.
  const twinOf = ITEM_TWIN;
  const pairKey = (a, b) => [a, b].sort((x, y) => x - y).join('-');
  const twinMergePhrase = {
    '1-9': 'מתקשה ביוזמה של תחילת פעילות',
    '4-12': 'מתקשה להתארגן על פי כללי הבית, כמו הנחת בגדים במקום ופינוי כלים',
    '5-13': diffPhrase[5],
    '6-14': diffPhrase[6],
    '8-16': diffPhrase[8],
  };

  const routineData = [
    { key: 'morning', inName: 'בשגרת בוקר וערב', score: d.morningAvg, cutoff: d.c.morning },
    { key: 'play', inName: 'בשגרת פנאי ומשחק', score: d.playAvg, cutoff: d.c.play },
    { key: 'social', inName: 'בשגרה החברתית', score: d.socialAvg, cutoff: d.c.social },
  ];
  const efData = [
    { key: 'inh', label: 'עכבה', score: d.inhAvg, cutoff: d.c.inh },
    { key: 'wm', label: 'זיכרון עבודה', score: d.wmAvg, cutoff: d.c.wm },
    { key: 'flex', label: 'גמישות מחשבתית', score: d.flexAvg, cutoff: d.c.flex },
  ];

  const weakRoutines = routineData.filter((r) => belowCutoff(r.score, r.cutoff));
  const okRoutines = routineData.filter((r) => !belowCutoff(r.score, r.cutoff));
  const weakEFs = efData.filter((e) => belowCutoff(e.score, e.cutoff));
  const okEFs = efData.filter((e) => !belowCutoff(e.score, e.cutoff));
  const totalBelow = belowCutoff(d.totalAvg, d.c.total);

  // canon B2, the EF-status rule: below its own cutoff = primary attribution;
  // within 0.15 above = "close" (secondary only, softened wording); more than
  // 0.15 above = "clearly above" and may NEVER be used to explain a
  // difficulty (rule 17) — it can only become a woven-in strength.
  const efStatus = (e) => {
    const diff = e.score - e.cutoff;
    if (diff < 0) return 'below';
    if (diff <= 0.15) return 'close';
    return 'above';
  };
  const efStatusMap = {};
  efData.forEach((e) => {
    efStatusMap[e.key] = efStatus(e);
  });

  const strongItemsAll = items.filter((i) => d.scores[i.num] >= 4);
  // S1 (QA 2026-10-11): a function is named as a strength ONLY when its own
  // status is clearly in norm (not below, not close, not at the cutoff).
  // Items 10/11 carry no function but are working-memory-like, so they
  // follow working memory.
  const strengthFunctionOk = (num) => {
    const it = items.find((x) => x.num === num);
    const ef = it.ef || (num === 10 || num === 11 ? 'wm' : null);
    return !ef || efStatusMap[ef] === 'above';
  };

  const fmt = (n) => n.toFixed(2);
  const header = (t) =>
    `<p style="font-weight:700; color:var(--primary); font-size:0.88rem; margin-bottom:6px;">${t}</p>`;
  const para = (t) => `<p style="font-size:0.85rem; margin-bottom:12px;">${t}</p>`;

  let s = '';

  // ===== תמונה כללית =====
  s += header('תמונה כללית');
  let intro = `על פי דיווח ההורים בשאלון ה-EFORTS, `;
  if (totalBelow && weakRoutines.length === 3) {
    intro += `עולה קושי בניהול עצמאי של שגרות היום-יום ביחס לבני ${hisAge} (${got} ציון כולל ${fmtScore(d.totalAvg, d.c.total)} כאשר ציון החתך הוא ${fmt(d.c.total)}). התפקוד בשלוש השגרות (בוקר וערב, פנאי ומשחק ושגרה חברתית) נמוך מהמצופה ${g('לגילו', 'לגילה')}.`;
  } else if (totalBelow && weakRoutines.length === 0) {
    // S6 (QA 2026-10-11): total below cutoff but no routine below — say so
    // plainly; never a dangling "בעיקר" with nothing after it.
    intro += `הציון הכולל נמוך מציון החתך (${got} ציון כולל ${fmtScore(d.totalAvg, d.c.total)} כאשר ציון החתך הוא ${fmt(d.c.total)}), אף שהציון בכל שגרה בנפרד אינו נמוך מציון החתך.`;
  } else if (totalBelow) {
    intro += `עולה קושי בניהול עצמאי של שגרות היום-יום ביחס לבני ${hisAge} (${got} ציון כולל ${fmtScore(d.totalAvg, d.c.total)} כאשר ציון החתך הוא ${fmt(d.c.total)}), בעיקר ${weakRoutines.map((r) => r.inName).join(' ו')}.`;
  } else if (weakRoutines.length > 0 || weakEFs.length > 0) {
    // canon F-4 / table row "Total in norm, profile weak": name "ציון כולל"
    // (not just the bare number) and LINK the weak routine to the EF behind
    // it ("נראה על רקע קושי ב...") instead of a flat comma list mixing
    // routines and EFs together.
    intro += `הציון הכולל הינו בתחום הנורמה (${got} ציון כולל ${fmtScore(d.totalAvg, d.c.total)} כאשר ציון החתך הוא ${fmt(d.c.total)}), אך מניתוח הפרופיל `;
    if (weakRoutines.length > 0) {
      intro += `עולים קשיים ${weakRoutines.map((r) => r.inName).join(' ו')}`;
      if (weakEFs.length > 0) {
        intro += `, נראה על רקע קושי ב${weakEFs.map((e) => e.label).join(' וב')}`;
      }
    } else {
      intro += `עולה קושי ב${weakEFs.map((e) => e.label).join(' וב')}`;
    }
    intro += '.';
  } else {
    // canon table row "Nothing below cutoff" (ASK E11): the only stated
    // default is "one in-norm sentence... none [else]" — no borderline/
    // frequency-label text. The old branch here quoted "לפעמים" (a
    // frequency label, rule 3) and invented a "רמה גבולית" concept the
    // canon explicitly flags; removed rather than replaced, per the
    // canon's own default.
    // Gemini review item 6: "תקין" / "ציון חתך" (no ה) are off-canon —
    // canon C2 bans "תקין לגמרי" and requires "ציון החתך" throughout.
    // Gemini review R7-2 (7.5): this sentence had no verb and dropped the
    // canon "(קיבל ציון כולל X כאשר ציון החתך הוא Y)" numeric form used
    // everywhere else in the summary.
    intro += `הניהול העצמאי של שגרות היום-יום הינו בטווח הנורמה ביחס לבני ${hisAge} (${got} ציון כולל ${fmtScore(d.totalAvg, d.c.total)} כאשר ציון החתך הוא ${fmt(d.c.total)}).`;
  }
  s += para(intro);

  // ===== משמעות קלינית — routine by routine, EF attribution inside =====
  if (weakRoutines.length > 0 || weakEFs.length > 0 || totalBelow) {
    s += header('משמעות קלינית');

    // canon F-7 / table row "Total in norm, profile weak" (MUST, Carmit
    // rule 6): fold "which routines are fine" into the FIRST weak routine's
    // own score sentence (C32's exact form), so its below-cutoff status is
    // said ONCE — not once here and again in its own paragraph below.
    let mergedFirstWeakPrefix = null;
    if (okRoutines.length > 0 && weakRoutines.length > 0) {
      if (!totalBelow) {
        const first = weakRoutines[0];
        mergedFirstWeakPrefix =
          okRoutines.length === 1
            ? `ממצאי השאלון מורים על ציון בטווח הנורמה (גבוה מציון החתך) ${okRoutines[0].inName}, והציון ${first.inName} `
            : `ממצאי השאלון מורים על ציונים בטווח הנורמה (גבוהים מציון החתך) ${okRoutines.map((r) => r.inName).join(' ו')}, והציון ${first.inName} `;
      } else {
        // canon table row "Total below, only 1-2 routines low" (SHOULD,
        // deduced — no model verifies this exact mix). Credit the in-norm
        // routine(s) once here and say nothing yet about the weak
        // routine(s)' status — each gets its own paragraph below, so
        // nothing is announced twice either way.
        s += para(
          `ממצאי השאלון מורים על ${okRoutines.length === 1 ? 'ציון' : 'ציונים'} בטווח הנורמה ${okRoutines.map((r) => r.inName).join(' ו')}.`,
        );
      }
    }

    // Tracks which EFs have already been named in an earlier routine
    // paragraph this summary, so a repeat gets a transition + a different
    // verb instead of the same opener repeated (canon rule 22, the
    // attribution verb bank in §B1).
    const usedEFs = new Set();
    let repeatCount = 0;
    // FX2-strength-nouns-spec §B: the ordered union of every routine
    // paragraph's woven-in strengths (item numbers, paragraph order) — fed
    // to strengthNounSlot() below for the מומלץ fallback (item 4).
    const woven = [];

    weakRoutines.forEach((r, idx) => {
      const rItems = items.filter((i) => i.routine === r.key);
      const rWeak = rItems
        .filter((i) => d.scores[i.num] <= 2)
        .sort((a, b) => d.scores[a.num] - d.scores[b.num]);
      const rStrong = rItems.filter((i) => d.scores[i.num] >= 4);

      let p;
      if (mergedFirstWeakPrefix && idx === 0) {
        p = `${mergedFirstWeakPrefix}נמוך מציון החתך (${got} ציון ${fmtScore(r.score, r.cutoff)} כאשר ציון החתך הוא ${fmt(r.cutoff)}). `;
      } else {
        // canon rule 13 / 0b#5: "באופן משמעותי" only at a gap >= 0.50, and
        // it's never required; otherwise plain. "במעט" is never correct —
        // Carmit wrote plain at a 0.14 gap in both her model cases.
        const gap = r.cutoff - r.score;
        const severity =
          gap >= 0.5
            ? `הציון מורה על תפקוד נמוך באופן משמעותי מהמצופה ${g('לגילו', 'לגילה')}`
            : `הציון נמוך מציון החתך`;
        p = `${r.inName} ${severity} (${got} ציון ${fmtScore(r.score, r.cutoff)} כאשר ציון החתך הוא ${fmt(r.cutoff)}). `;
      }

      // Group this routine's weak items by EF function, then drop any EF
      // that is clearly above its OWN cutoff (canon B2 / rule 17) — that EF
      // never explains a difficulty here no matter how many weak items in
      // this routine happen to carry it; it can only become a strength below.
      const byEf = {};
      rWeak.forEach((i) => {
        if (!i.ef) return; // rule 21: items 10/11 are never EF evidence
        (byEf[i.ef] = byEf[i.ef] || []).push(i);
      });
      // S4 (QA 2026-10-11): with NO function below its cutoff, a "close" one
      // is never the main explanation — the paragraph stays routine-only.
      // S4b (re-check): the rule is PER PARAGRAPH — a close function may be
      // named only as the secondary one, and only when a below-cutoff
      // function is ALSO named in this same paragraph. Otherwise the
      // paragraph falls to the routine-only branch (score sentence only).
      const paragraphHasBelowEf = Object.keys(byEf).some((ef) => efStatusMap[ef] === 'below');
      const eligibleEfKeys = Object.keys(byEf).filter(
        (ef) => efStatusMap[ef] === 'below' || (efStatusMap[ef] === 'close' && paragraphHasBelowEf),
      );
      const statusRank = { below: 0, close: 1 };
      const efOrder = eligibleEfKeys.sort(
        (a, b) =>
          statusRank[efStatusMap[a]] - statusRank[efStatusMap[b]] ||
          byEf[b].length - byEf[a].length ||
          d.scores[byEf[a][0].num] - d.scores[byEf[b][0].num],
      );
      const chosen = efOrder.slice(0, 2); // canon: max 2 EFs per routine paragraph

      // canon B3: 1-2 examples per EF, lowest score first, merging a
      // morning/evening twin into one clause when it's also weak (or rides
      // along at exactly 3 — rule 7).
      const buildExamples = (weakItemsForEf, maxExamples = 2) => {
        const used = new Set();
        const examples = [];
        for (const it of weakItemsForEf) {
          if (examples.length >= maxExamples) break;
          if (used.has(it.num)) continue;
          const twinNum = twinOf[it.num];
          const twinScore = twinNum != null ? d.scores[twinNum] : undefined;
          if (twinNum != null && !used.has(twinNum) && twinScore != null && twinScore <= 3) {
            const key = pairKey(it.num, twinNum);
            const phrase = twinMergePhrase[key];
            if (phrase) {
              const [a, b] = key.split('-').map(Number);
              examples.push(`${phrase} (פריט ${a} ופריט ${b})`);
              used.add(it.num);
              used.add(twinNum);
              continue;
            }
          }
          examples.push(`${diffPhrase[it.num]} (פריט ${it.num})`);
          used.add(it.num);
        }
        return examples.join(' או ');
      };

      let attribution = '';
      if (chosen.length === 1) {
        const ef = chosen[0];
        const examples = buildExamples(byEf[ef]);
        if (usedEFs.has(ef)) {
          // canon rule 22: this EF was already named in an earlier
          // paragraph — a transition + a different verb, rotating through
          // the attribution verb bank instead of repeating "מושפע" again.
          attribution =
            repeatCount % 2 === 0
              ? `גם כאן נראה כי הקושי התפקודי קשור לקושי ב${efNames[ef]}, כמו למשל – ${examples}.`
              : // FX1-r2 fix 2: don't open a new sentence with "ו" right after
                // a period — dropped the leading ו. FX1-r2 fix 1: "מתבטא ב..."
                // needs a "בכך ש{pronoun}..." clause before a verb-phrase
                // description, not a bare ב-prefix glued onto the verb
                // itself ("מתבטא במביע" is ungrammatical). Also fixes the
                // "תפקודו" hardcode the FX1 check's §5 female-form audit
                // flagged: gendered via g().
                `נראה מממצאי השאלון כי הקושי המנמיך את ${g('תפקודו', 'תפקודה')} בתחום זה הוא הקושי ב${efNames[ef]}, וזה מתבטא בכך ש${g('הוא', 'היא')} ${examples}.`;
          repeatCount++;
        } else {
          attribution = `נראה כי הקושי התפקודי מושפע מקושי ב${efNames[ef]}, כמו למשל – ${examples}.`;
        }
      } else if (chosen.length === 2) {
        const [ef1, ef2] = chosen;
        const ex1 = buildExamples(byEf[ef1]);
        const ex2 = buildExamples(byEf[ef2]);
        if (efStatusMap[ef2] === 'close') {
          // canon rule 16: lead EF below cutoff + second EF close to its
          // own cutoff — the lead gets "לרוב", the second is softened.
          // FX1-r2 fix 1: same grammar class as the repeated-EF branch above
          // — "כפי שמתבטא ב..." needs the "בכך ש{pronoun}..." clause before
          // a verb-phrase description ("מתבטא בזקוק" is ungrammatical).
          // Gemini review item 5: the "כמו למשל" dash was missing on this
          // path (model 32 had none) — one form everywhere now: "– " (en
          // dash, spaced).
          attribution = `נראה כי הקושי התפקודי נובע לרוב מקושי ב${efNames[ef1]}, כמו למשל – ${ex1}, ולעיתים על רקע קושי ב${efNames[ef2]}, כפי שמתבטא בכך ש${g('הוא', 'היא')} ${ex2}.`;
        } else if (usedEFs.has(ef1) && usedEFs.has(ef2)) {
          // S7 / canon F22: both functions were already named in an earlier
          // paragraph — a transition, not the same opener again.
          attribution = `גם כאן נראה כי הקושי התפקודי קשור לקושי ב${efNames[ef1]}, כמו למשל – ${ex1}, וכן לקושי ב${efNames[ef2]}, שמתבטא בין השאר בכך ש${g('הוא', 'היא')} ${ex2}.`;
        } else {
          // canon rule 16: two EFs both below their own cutoffs share equal
          // weight — no "בעיקר" on the first.
          // Gemini review item 2: a pronoun replaces the number mid-sentence
          // ("בכך ש-50 מוסח" read like the number was the subject).
          attribution = `נראה כי הקושי התפקודי מושפע מקושי ב${efNames[ef1]}, כמו למשל – ${ex1}, וכן מקושי ב${efNames[ef2]}, שמתבטא בין השאר בכך ש${g('הוא', 'היא')} ${ex2}.`;
        }
      }
      chosen.forEach((ef) => usedEFs.add(ef));

      if (attribution) p += attribution + ' ';

      // Routine-only paragraph (no below-cutoff function named): state the
      // functions that are CLOSE to their cutoff, score only, no cause
      // (Allison 2026-10-11: "state that it was close to cut off if there is
      // no other problem").
      if (chosen.length === 0) {
        const closeEfs = efData.filter((e) => efStatusMap[e.key] === 'close');
        if (closeEfs.length > 0) {
          const scoreText = (e) =>
            `${got} ציון ${fmtScore(e.score, e.cutoff)} כאשר ציון החתך הוא ${fmt(e.cutoff)}`;
          const examples = closeEfs
            .filter((e) => byEf[e.key])
            .map((e) => buildExamples(byEf[e.key], 1))
            .filter(Boolean);
          const exText = examples.length ? `, כמו למשל – ${examples.join(' או ')}` : '';
          if (closeEfs.length === 1) {
            const e = closeEfs[0];
            p += `הציון ב${efNames[e.key]} קרוב לציון החתך (${scoreText(e)})${exText}. `;
          } else {
            const names = closeEfs.map((e) => `ב${efNames[e.key]}`);
            const joined = `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
            const inner = closeEfs
              .map((e, i) => `${i === 0 ? '' : 'ו'}ב${efNames[e.key]} ${scoreText(e)}`)
              .join(', ');
            p += `הציונים ${joined} קרובים לציון החתך (${inner})${exText}. `;
          }
        }
      }

      // canon B4: a woven-in strength must come from an EF NOT blamed in
      // this paragraph, and must not contradict a cited item OR that
      // item's twin (e.g. "solves problems" is false when the twin item
      // scored low, even if that twin itself wasn't cited here).
      const blamedEFs = new Set(chosen);
      const eligibleStrong = rStrong.filter((i) => {
        if (i.ef && blamedEFs.has(i.ef)) return false;
        if (!strengthFunctionOk(i.num)) return false;
        const twinNum = twinOf[i.num];
        const twinScore = twinNum != null ? d.scores[twinNum] : undefined;
        if (twinScore != null && twinScore <= 2) return false;
        return true;
      });
      if (eligibleStrong.length > 0) {
        // FX2-strength-nouns-spec §B step 1: feed the מומלץ noun-phrase
        // slot from the SAME items this paragraph already wove in as
        // strengths, in the SAME order/cap it uses (item order, first 3) —
        // pushed from the raw list (both twin numbers, when both are
        // strong) so strengthNounSlot's own twin-merge (step 2) can see
        // both and produce one "…והערב" entry instead of two.
        woven.push(...eligibleStrong.slice(0, 3).map((i) => i.num));

        // Twin-pair duplication bug (FX2 spec "Seen while specifying"):
        // both twins of a pair (e.g. items 6 + 14) share one strengthPhrase
        // string — without this, a strong twin pair printed the SAME
        // infinitive twice ("...מצליח להתעלם מגירויים מסיחים וכן להתעלם
        // מגירויים מסיחים"). Dedupe by phrase text before capping at 3, so
        // the sentence never repeats itself and a 3rd, distinct strength
        // gets the freed slot.
        const seenPhrases = new Set();
        const dedupedStrong = eligibleStrong.filter((i) => {
          const phrase = strengthPhrase[i.num];
          if (seenPhrases.has(phrase)) return false;
          seenPhrases.add(phrase);
          return true;
        });
        const sPhrases = dedupedStrong.slice(0, 3).map((i) => strengthPhrase[i.num]);
        // FX1-r2 fix 3: frame the strength through its EF, Carmit's C50
        // form ("בתחום זה נראה כי היכולת שלו בתחום ה[EF] באה לידי ביטוי,
        // והוא [strength] וכן [strength]") — generalized to any strength
        // set that shares a single EF, not just flexibility/play. Each
        // strengthPhrase entry already carries its own gendered verb, so no
        // separate lead verb is needed; a mixed-EF strength set (no model
        // case) falls back to the old EF-agnostic phrasing.
        const strongEfKeys = [
          ...new Set(
            dedupedStrong
              .slice(0, 3)
              .map((i) => i.ef)
              .filter(Boolean),
          ),
        ];
        if (strongEfKeys.length === 1) {
          const efLabel = efNamesDef[strongEfKeys[0]];
          p += `בתחום זה נראה כי היכולת ${g('שלו', 'שלה')} בתחום ${efLabel} באה לידי ביטוי, ו${g('הוא', 'היא')} ${g('מצליח', 'מצליחה')} ${sPhrases.join(' וכן ')}.`;
        } else {
          const joined =
            sPhrases.length > 1
              ? sPhrases.slice(0, -1).join(', ') + ' ו' + sPhrases[sPhrases.length - 1]
              : sPhrases[0];
          p += `לצד זאת, ${g('הוא', 'היא')} ${g('מצליח', 'מצליחה')} ${joined}.`;
        }
      }
      // canon B4 (last line): with no eligible strength, write nothing —
      // don't reach for a filler.

      s += para(p.trim());
    });

    // Cross-EF view (canon B5): status in WORDS only, no behavioral claims
    // the item data doesn't support. The three canned sentences this used
    // to end with are gone — rule 35's grounding failures (e.g. "זוכר
    // רצפים ומתניע לבד" while this same summary cites item 9/1 as weak two
    // paragraphs up) came from exactly this kind of invented claim.
    // Gemini review item 1: prose in Carmit's own shape (C32, canon B5),
    // not a table row — no semicolons and no dashes, "ואכן" follows a
    // comma not a period (canon F36), and efStatusMap (already computed
    // above) is read instead of re-deriving the 0.15 "close" line a
    // second time here.
    const efStatusText = (e) =>
      efStatusMap[e.key] === 'close' ? 'קרוב לציון החתך' : 'גבוה מציון החתך';
    const joinEfClauses = (arr) => arr.join(', ו');
    let efPara = 'בהסתכלות על תפקודים ניהוליים ספציפיים, ';
    if (weakEFs.length === 1) {
      const e = weakEFs[0];
      efPara += `נראה כי הקושי הבולט יותר הוא בתפקוד הניהולי ${e.label}, ואכן הציון בתפקוד זה נמוך מציון החתך (${got} ציון ${fmtScore(e.score, e.cutoff)} כאשר ציון החתך הוא ${fmt(e.cutoff)}).`;
      if (okEFs.length > 0) {
        // Gemini review R7-3 (7.6): when both remaining EFs share the SAME
        // status, one plural clause reads cleaner than two repeated
        // "הציון ב-X..." clauses. Mixed statuses (one close, one above)
        // stay as two clauses, unchanged.
        if (okEFs.length === 2 && efStatusMap[okEFs[0].key] === efStatusMap[okEFs[1].key]) {
          const [o1, o2] = okEFs;
          const statusPlural =
            efStatusMap[o1.key] === 'close' ? 'קרובים לציון החתך' : 'גבוהים מציון החתך';
          efPara += ` בתפקודים האחרים המנותחים בשאלון, הציונים ב${o1.label} וב${o2.label} ${statusPlural}.`;
        } else {
          const okClauses = okEFs.map((o) => `הציון ב${o.label} ${efStatusText(o)}`);
          efPara += ` בתפקודים האחרים המנותחים בשאלון, ${joinEfClauses(okClauses)}.`;
        }
      }
    } else if (weakEFs.length === 2) {
      const [e1, e2] = weakEFs;
      efPara += `נראה כי הקושי הבולט הוא ב${e1.label} וב${e2.label}, ואכן הציונים בתפקודים אלו נמוכים מציון החתך (ב${e1.label} ${got} ציון ${fmtScore(e1.score, e1.cutoff)} כאשר ציון החתך הוא ${fmt(e1.cutoff)}, וב${e2.label} ${got} ציון ${fmtScore(e2.score, e2.cutoff)} כאשר ציון החתך הוא ${fmt(e2.cutoff)}).`;
      if (okEFs.length > 0) {
        const e3 = okEFs[0];
        efPara += ` הציון בתפקוד השלישי שנבדק בשאלון, ${e3.label}, ${efStatusText(e3)}.`;
      }
    } else if (weakEFs.length === 3) {
      // Three weak EFs (no model case, canon E11): extend the two-EF
      // template naturally rather than invent a new shape.
      const names = weakEFs.map((e) => e.label);
      const namesJoined = names.slice(0, -1).join(', ') + ' ו' + names[names.length - 1];
      const scoresJoined = weakEFs
        .map(
          (e) =>
            `ב${e.label} ${got} ציון ${fmtScore(e.score, e.cutoff)} כאשר ציון החתך הוא ${fmt(e.cutoff)}`,
        )
        .join(', ');
      efPara += `נראה כי הקושי הבולט הוא ב${namesJoined}, ואכן הציונים בתפקודים אלו נמוכים מציון החתך (${scoresJoined}).`;
    } else {
      // Gemini review item 6: "בטווח התקין" is off-canon (canon C2 wants
      // "בטווח הנורמה").
      // Gemini review R7-4 (7.9, BUG found while preparing round 7): the old
      // text here said "כל התפקודים הניהוליים בטווח הנורמה" whenever NO EF
      // was below its own cutoff — including when one was merely "close"
      // (within EF_CLOSE_MARGIN), contradicting the card, which shows
      // "קרוב לציון החתך" for that EF. Group by efStatusMap instead, in the
      // fixed instrument order (עכבה → זיכרון עבודה → גמישות מחשבתית), and
      // name every EF's own status.
      // R7-4 (7.8) also deletes the old "ייתכן שהקושי בשגרות נובע מגורמים
      // סביבתיים..." sentence: it named causes the questionnaire doesn't
      // measure, and an EF average in norm overall doesn't rule out an EF
      // part in ONE routine (same "not X" ban fix 6 already applied).
      const aboveGroup = efData.filter((e) => efStatusMap[e.key] === 'above');
      const closeGroup = efData.filter((e) => efStatusMap[e.key] === 'close');
      const namesB = (arr) =>
        arr.length === 1 ? `ב${arr[0].label}` : `ב${arr[0].label} וב${arr[1].label}`;

      let statusSentence;
      if (aboveGroup.length === 3) {
        statusSentence = 'הציונים בכל התפקודים הניהוליים הינם בטווח הנורמה';
      } else if (closeGroup.length === 3) {
        statusSentence = 'הציונים בכל התפקודים הניהוליים קרובים לציון החתך';
      } else {
        const aboveClause =
          aboveGroup.length === 1
            ? `הציון ${namesB(aboveGroup)} הינו בטווח הנורמה`
            : `הציונים ${namesB(aboveGroup)} הינם בטווח הנורמה`;
        const closeClause =
          closeGroup.length === 1
            ? `הציון ${namesB(closeGroup)} קרוב לציון החתך`
            : `הציונים ${namesB(closeGroup)} קרובים לציון החתך`;
        statusSentence = `${aboveClause}, ו${closeClause}`;
      }

      // One bracket with all three EFs, fixed order, ב- form throughout
      // (the round-1 gender trap: "עכבה קיבל ציון" reads as if the EF name
      // were the subject — "בעכבה קיבל ציון" keeps the child as subject).
      const bracketParts = efData.map(
        (e) =>
          `ב${e.label} ${got} ציון ${fmtScore(e.score, e.cutoff)} כאשר ציון החתך הוא ${fmt(e.cutoff)}`,
      );
      const bracket =
        bracketParts.slice(0, -1).join(', ') + ', ו' + bracketParts[bracketParts.length - 1];

      efPara += `${statusSentence} (${bracket}).`;
    }
    // S6: total below with nothing else below — the cross-function paragraph
    // only when some function is close to its cutoff.
    const onlyTotalBelow = weakRoutines.length === 0 && weakEFs.length === 0;
    if (!(onlyTotalBelow && efData.every((e) => efStatusMap[e.key] === 'above'))) {
      s += para(efPara);
    }

    // ===== המלצה =====
    let rec =
      'מומלץ על טיפול שיכלול הדרכת הורים אודות התפתחות התפקודים הניהוליים וכיצד ההורים יכולים לסייע בהקניית אסטרטגיות יעילות התומכות בתפקוד';
    if (weakEFs.length > 0) {
      rec += `, תוך ניתוח דרישות המטלה והסביבה וקביעת מטרות ישימות לטווח קצר, בהתייחס למוקד הקושי ב${weakEFs.map((e) => e.label).join(' וב')}`;
    } else {
      rec += ', תוך ניתוח דרישות המטלה והסביבה והתאמת השגרה בבית';
    }
    if (strongItemsAll.length >= 2) {
      // canon D "Strengths" part: motivation + small successes + recruiting
      // strengths from an easier routine toward the harder ones, named with
      // pronouns / possessives (no anonymous number, no "הילד" — rule 25).
      // Gemini review item 3: "כמו כן מומלץ לשים דגש" repeated the
      // מ-ל-צ root right after "מומלץ על טיפול" — Carmit's C32 wording
      // ("תוך שימת דגש על") folds this into ONE sentence instead.
      // Gemini review item 4 / FX2-strength-nouns-spec: when in-norm
      // routines exist, keep naming them (unchanged, §C precedence 1);
      // otherwise, name the real strength items instead of the vague
      // fallback (§C precedence 2); "במשימות אחרות" only when neither
      // applies (§C precedence 3, Carmit's own C32 wording).
      // Gemini review R7-5b (7.11): when NO routine is below cutoff (the
      // EF-only profile), there's no harder routine to transfer strengths
      // onto — end at the success-collecting clause instead of inventing a
      // target ("...אל המשימות שקשות לו יותר" implied a harder routine that
      // doesn't exist here).
      if (weakRoutines.length === 0) {
        rec += `, תוך שימת דגש על ${hisMotivation} ועל איסוף חוויות של הצלחה, גם אם קטנות.`;
      } else {
        // Gemini review R7-5a (7.10): joinHe ("A, B וC"), never the flat
        // "A וB וC" a plain join(' ו') produces for three routines. Guarded
        // on length — joinHe([]) has no defined "0 items" case (it's built
        // for the 1+ case elsewhere), so keep the empty-string fallthrough
        // a bare join(' ו') gave for free when okRoutines is empty (e.g.
        // model-50/50f, all three routines weak) — that '' is what lets the
        // next `||` reach strengthNounSlot()/the vague fallback.
        const strengthRoutines =
          okRoutines.length > 0 ? joinHe(okRoutines.map((r) => r.inName)) : '';
        const strengthSlot = strengthRoutines || strengthNounSlot(woven) || 'במשימות אחרות';
        rec += `, תוך שימת דגש על ${hisMotivation}, איסוף חוויות של הצלחה גם אם קטנות, וגיוס ${g('כוחותיו', 'כוחותיה')} המתבטאים ${strengthSlot} אל המשימות שקשות ${g('לו', 'לה')} יותר.`;
      }
    } else {
      rec += '.';
    }
    s += para(rec);
  }

  return s;
}

// AI-13: the new prompt. Top-level so buildExportText() can call it. The
// template literal's lines sit flush left — anything indented inside the
// backticks would end up in the downloaded file.
function aiPrompt(gender) {
  return `הנחיות לכלי ה-AI:

1. מה כבר קיים. הציונים חושבו בכלי, והסיכום הקליני שלמעלה (תמונה כללית, משמעות קלינית ופסקת "מומלץ") נכתב בכלי לפי כללי הכתיבה שנגזרו מהנוסח של מחברות השאלון. אל תחשב מחדש אף ציון, אל תשנה אף מספר, ואל תכתוב מחדש את הסיכום או חלק ממנו.

2. מה אתה כותב: רק את פסקת המטפל/ת. זו פסקה אחת, שנכנסת בין "משמעות קלינית" לבין פסקת "מומלץ", ומצרפת את ממצאי השאלון לתמונה הקלינית מהמפגש. פתח כמו בנוסח של המחברות: "אם מצרפים ממצאי הערכה אלו לתמונה הקלינית בשטח עולה כי…". כתוב אותה רק ממה שהמטפל/ת מוסר/ת לך בשיחה הזו: תצפיות מהמפגש, דיווח של ההורים או של הצוות החינוכי, ממצאים ממבדקים אחרים. אם לא נמסרו תצפיות, אל תכתוב את הפסקה, ושאל את המטפל/ת מה נצפה.

3. תוספת לפסקת "מומלץ", רק אם המטפל/ת ביקש/ה: חצי משפט שמתחבר לסוף הפסקה הקיימת, רק ממה שעלה במפגש (לדוגמה "וייתכן גם ויסות רגשי", כשזה עלה בטיפול ולא מהשאלון). בלי מספר טיפולים, תדירות, שמות פרוטוקולים, הפניות או אבחנות.

4. לא להמציא. כל משפט נשען על הקובץ הזה או על מה שהמטפל/ת כתב/ה בשיחה. אף משפט לא סותר ציון של פריט או משפט אחר בסיכום. מוטיבציה, ביטחון עצמי, ויסות רגשי וקשב נכתבים רק אם המטפל/ת מסר/ה אותם.

5. קול ושפה, כמו בסיכום:
- גוף שלישי. פעלים רכים: "מתקשה ל…", "זקוק ל…", "מוסח מ…", "עולה קושי ב…", "נראה כי", "ייתכן", "על רקע", "ככל הנראה".
- בלי שרשראות שלילה ("לא עושה, לא זוכר") ובלי ניגוד מהסוג "לא X אלא Y".
- בלי תוויות אבחנתיות או תכונתיות ("אימפולסיבי", ADHD, "קשב" כאבחנה). מתארים התנהגות: פזיזות, מוסחות, קושי בעכבה.
- "איחור" או "עיכוב" לעולם אינם קביעה כללית; קושי נכתב תמיד בתחום שלו.
- כינוי למטופל/ת: רק כינוי גוף ("הוא", "היא"). לעולם לא המספר האנונימי, לעולם לא "הילד" או "הילדה", לעולם לא שם או ת״ז, ואין לבקש אותם.
- מין: ${gender}. התאמת מין בכל פועל, כינוי וסיומת. אם המין לא צוין, שאל לפני שאתה כותב.
- עברית בלבד. המילה הלועזית היחידה: EFORTS.

6. מונחים, בדיוק כך: עכבה · זיכרון עבודה · גמישות מחשבתית · תפקודים ניהוליים · ציון החתך · ציון כולל · בטווח הנורמה (בסיכום מופיע גם "בתחום הנורמה", ולתפקוד ניהולי גם "גבוה מציון החתך") · שגרת בוקר וערב · שגרת פנאי ומשחק · השגרה החברתית · שגרות היום-יום. לא: "סף", "נקודת חתך", "פונקציות ניהוליות", "תקין לגמרי".

7. מספרים ופריטים. ציון נכתב בצורה "(קיבל/ה ציון X כאשר ציון החתך הוא Y)", שתי ספרות אחרי הנקודה, בדיוק כפי שהוא מופיע למעלה. בלי ממוצעים, סטיות תקן, אחוזונים, "מתחת לממוצע", ובלי מילות התשובה ("לפעמים", "לעיתים רחוקות"). פריט נכתב "פריט N"; שני פריטים: "(פריט N ופריט M)".

8. תפקודים ניהוליים. תפקוד ניהולי שציונו נמוך מציון החתך הוא ההסבר העיקרי לקושי. תפקוד שציונו "קרוב לציון החתך" (עד 0.15 מעליו) יכול להסביר קושי רק כגורם משני ("ולעיתים על רקע קושי ב…"). תפקוד שציונו גבוה מציון החתך ביותר מ-0.15 (במצב "בטווח הנורמה" ברשימת הציונים) אינו מסביר קושי; הוא יכול להופיע רק כחוזקה. פריטים 10 ו-11 אינם ראיה לאף תפקוד ניהולי.

9. פורמט. טקסט רגיל בלבד: בלי כוכביות, בלי כותרות ובלי תבליטים, כי הטקסט מודבק למערכת שמוחקת עיצוב. החזר רק את הפסקה המבוקשת, בלי משפט פתיחה כמו "להלן הפסקה"; רק שורה אחת שאומרת איפה הפסקה נכנסת, ואחריה הפסקה.

10. בקשות אחרות (נוסח לדוח, גרסה להורים, מטרות טיפול): למחברות עוד אין נוסח מוסכם לאלה. כתוב אותן רק אם המטפל/ת ביקש/ה במפורש, פתח ב"טיוטה — לבדיקת המטפל/ת", ושמור על כל הכללים שלמעלה.

לפני שאתה עונה, בדוק:
[ ] לא חישבתי ולא שיניתי אף ציון, ולא כתבתי מחדש את הסיכום.
[ ] כל משפט נשען על הקובץ או על דברי המטפל/ת, ואף משפט לא סותר ציון של פריט.
[ ] אין "הילד" או "הילדה", אין מספר, שם או ת״ז; רק כינוי גוף.
[ ] התאמת מין בכל מקום.
[ ] פעלים רכים; בלי שרשראות שלילה, בלי תוויות אבחנתיות, בלי "איחור" כללי.
[ ] מונחים ומספרים בדיוק בצורה שלמעלה.
[ ] בלי מספר טיפולים, פרוטוקולים, הפניות או אבחנות.
[ ] טקסט רגיל, בלי עיצוב.
`;
}

// Pure: builds the "הורד ל-AI" export text from the current form/results
// state. No DOM writes, no download — downloadForAI() below does that, so
// this is directly testable via page.evaluate(() => buildExportText()).
function buildExportText() {
  const genderRaw = document.getElementById('childGender').value;
  const gender = genderText(genderRaw);
  const isMale = genderRaw === 'male';
  const ageText = document.getElementById('calcAge').textContent;
  const ageLabel = document.getElementById('ageGroupDisplay').textContent;
  const ageGroup = document.getElementById('ageGroup').value;
  // Item 8: escape here too — this text also feeds buildSummary() below.
  // The details line is plain text: the raw trimmed number, no HTML entities.
  // buildSummary() below returns HTML, so it gets the escaped form.
  const anonIdRaw = getAnonId() || '—';
  const anonIdText = escapeHtml(getAnonId()) || '—';
  const efLabels = { inh: 'עכבה', wm: 'זיכרון עבודה', flex: 'גמישות מחשבתית' };

  // Collect all scores
  const scores = {};
  items.forEach((item) => {
    const checked = document.querySelector(`input[name="q${item.num}"]:checked`);
    if (checked) scores[item.num] = parseInt(checked.value);
  });

  // Compute averages
  const morningItems = items.filter((i) => i.routine === 'morning').map((i) => scores[i.num]);
  const playItems = items.filter((i) => i.routine === 'play').map((i) => scores[i.num]);
  const socialItems = items.filter((i) => i.routine === 'social').map((i) => scores[i.num]);
  const morningAvg = avg(morningItems);
  const playAvg = avg(playItems);
  const socialAvg = avg(socialItems);
  const totalAvg = avg([morningAvg, playAvg, socialAvg]);
  const inhAvg = avg(items.filter((i) => i.ef === 'inh').map((i) => scores[i.num]));
  const wmAvg = avg(items.filter((i) => i.ef === 'wm').map((i) => scores[i.num]));
  const flexAvg = avg(items.filter((i) => i.ef === 'flex').map((i) => scores[i.num]));
  const c = cutoffs[ageGroup];

  const companions = {
    morning: document.getElementById('companion_morning')?.value || '',
    play: document.getElementById('companion_play')?.value || '',
    social: document.getElementById('companion_social')?.value || '',
  };
  const compLabels = { mom: 'אמא', dad: 'אבא', both: 'שני ההורים', other: 'אחר' };

  const scoreNames = ['', 'אף פעם', 'לעיתים רחוקות', 'לפעמים', 'לעיתים קרובות', 'תמיד'];

  let text = `למטפל/ת: קובץ זה מיועד לכלי AI (Claude, ChatGPT, Copilot). העל/י אותו לכלי, ספר/י לו מה נצפה במפגש, והוא יכתוב פסקה אחת לשילוב בסיכום.\n`;
  text += `אין להדביק קובץ זה בקליקס — לקליקס משתמשים בכפתור "העתקה לקליקס".\n`;
  text += `──────────────────────────────────\n\n`;
  text += `שאלון EFORTS — נתוני קידוד לשימוש בכלי AI\n`;
  text += `══════════════════════════════════\n\n`;

  text += `רקע על הכלי:\n`;
  text += `EFORTS (Executive Functions & Occupational Routine Scale) — "שאלון למדידת יכולת הניהול העצמי של ילדים בשגרות היום יום" (Frisch & Rosenblum, 2014; נורמות וציוני חתך: Frisch & Rosenblum, 2024). שאלון להורים, לגילאי 3.0–11.11: 30 פריטים בשלוש שגרות — שגרות בוקר וערב (פריטים 1–16), שגרות פנאי ומשחק (17–23) ושגרה חברתית (24–30). כל פריט מדורג מ-1 (אף פעם) עד 5 (תמיד); ציון גבוה = תפקוד טוב יותר. ציון שגרה = ממוצע פריטי השגרה; ציון כולל = ממוצע שלושת ציוני השגרות. כל פריט משויך גם לאחד משלושה תפקודים ניהוליים — עכבה, זיכרון עבודה או גמישות מחשבתית; פריטים 10 ו-11 אינם נכללים בחישוב התפקודים הניהוליים. ציון החתך נקבע 1.5 סטיות תקן מתחת לממוצע של קבוצת הגיל. ציון נמוך מציון החתך מורה על חשד לקושי בתחום שנמדד בלבד (בשגרה או בתפקוד הניהולי), ואינו קביעה של עיכוב כללי.\n\n`;

  text += `פרטי המטופל/ת:\n`;
  text += `  מספר אנונימי: ${anonIdRaw} | מין: ${gender} | גיל: ${ageText} | קבוצת גיל נורמטיבית: ${ageLabel}\n\n`;

  const line = (label, sc, ct, kind) =>
    `    ${label}: ${fmtScore(sc, ct)} | ציון החתך: ${ct.toFixed(2)} | ${cutoffStatus(sc, ct, kind).text}\n`;
  text += `ציונים (חושבו בכלי — אין לחשב מחדש): ציון, ציון החתך, מצב\n`;
  text += `  שגרות:\n`;
  text += line('בוקר וערב', morningAvg, c.morning, 'routine');
  text += line('פנאי ומשחק', playAvg, c.play, 'routine');
  text += line('שגרה חברתית', socialAvg, c.social, 'routine');
  text += line('ציון כולל', totalAvg, c.total, 'total');
  text += `  תפקודים ניהוליים:\n`;
  text += line('עכבה', inhAvg, c.inh, 'ef');
  text += line('זיכרון עבודה', wmAvg, c.wm, 'ef');
  text += line('גמישות מחשבתית', flexAvg, c.flex, 'ef');
  text += `\n`;

  // All 30 items with scores
  text += `פריטים וציונים:\n`;
  const routines = [
    { key: 'morning', label: 'שגרת בוקר וערב', range: [1, 16] },
    { key: 'play', label: 'שגרת פנאי ומשחק', range: [17, 23] },
    { key: 'social', label: 'שגרה חברתית', range: [24, 30] },
  ];
  routines.forEach((r) => {
    const comp = companions[r.key]
      ? ` (מי נמצא בדרך כלל בשגרות אלו: ${compLabels[companions[r.key]] || companions[r.key]})`
      : '';
    text += `\n${r.label}${comp}:\n`;
    items
      .filter((i) => i.num >= r.range[0] && i.num <= r.range[1])
      .forEach((item) => {
        const sc = scores[item.num];
        const ef = item.ef ? efLabels[item.ef] : 'לא כלול בתפקודים הניהוליים';
        text += `  ${item.num}. ${item.text} — ${sc} (${scoreNames[sc]}) [${ef}]\n`;
      });
  });

  // AI-12: the fixed summary, so the AI sees exactly what it must not rewrite.
  const summaryHtml = buildSummary({
    anonId: anonIdText,
    gender,
    isMale,
    sexUnset: !genderRaw,
    ageText,
    ageLabel,
    morningAvg,
    playAvg,
    socialAvg,
    totalAvg,
    inhAvg,
    wmAvg,
    flexAvg,
    c,
    scores,
  });
  text += `\nהסיכום הקליני שנכתב בכלי (קבוע — אין לשנות):\n`;
  text += summaryHtmlToText(summaryHtml) + '\n';

  text += '\n' + aiPrompt(gender);

  return text;
}

// Clicks text (Sara Orit's Oct 7 email: copying the summary from the PDF into
// Clicks put the brackets in the wrong place — a PDF stores Hebrew in visual
// order). Her fix, Sun 2026-10-11: a download that opens in Notepad, "the
// best for copying and pasting". Plain text, logical order, the summary only.
function buildClicksText() {
  const genderRaw = document.getElementById('childGender').value;
  const ageGroup = document.getElementById('ageGroup').value;
  const scores = {};
  items.forEach((item) => {
    const checked = document.querySelector(`input[name="q${item.num}"]:checked`);
    if (checked) scores[item.num] = parseInt(checked.value);
  });
  const routineAvg = (r) => avg(items.filter((i) => i.routine === r).map((i) => scores[i.num]));
  const efAvg = (ef) => avg(items.filter((i) => i.ef === ef).map((i) => scores[i.num]));
  const morningAvg = routineAvg('morning');
  const playAvg = routineAvg('play');
  const socialAvg = routineAvg('social');
  const summaryHtml = buildSummary({
    anonId: escapeHtml(getAnonId()) || '—',
    gender: genderText(genderRaw),
    isMale: genderRaw === 'male',
    sexUnset: !genderRaw,
    ageText: document.getElementById('calcAge').textContent,
    ageLabel: document.getElementById('ageGroupDisplay').textContent,
    morningAvg,
    playAvg,
    socialAvg,
    totalAvg: avg([morningAvg, playAvg, socialAvg]),
    inhAvg: efAvg('inh'),
    wmAvg: efAvg('wm'),
    flexAvg: efAvg('flex'),
    c: cutoffs[ageGroup],
    scores,
  });
  // UX2-6: a heading line is followed DIRECTLY by its first paragraph; one
  // blank line between paragraphs and before the next heading.
  const tight = summaryHtml.replace(/(<p style="font-weight:700;[^>]*>[^<]*)<\/p>/g, '$1<br>');
  return summaryHtmlToText(tight)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const S_CLICKS_COPIED = 'הועתק ✓ — אפשר להדביק בקליקס';
let clicksTimer = null;

function copyClicksText() {
  const text = buildClicksText().replace(/\r?\n/g, '\r\n');
  const status = document.getElementById('clicksStatus');
  const ok = () => {
    status.className = 'import-status ok';
    status.textContent = S_CLICKS_COPIED;
    clearTimeout(clicksTimer);
    clicksTimer = setTimeout(() => {
      if (status.textContent === S_CLICKS_COPIED) {
        status.textContent = '';
        status.className = 'import-status';
      }
    }, 5000);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    ta.remove();
    if (done) ok();
    else {
      status.className = 'import-status err';
      status.textContent = 'ההעתקה לא הצליחה — השתמש/י בהורדה כקובץ טקסט.';
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok, fallback);
  } else {
    fallback();
  }
}

function downloadForClicks() {
  // BOM so Notepad opens the Hebrew as UTF-8; CRLF for Windows Notepad.
  const text = '\uFEFF' + buildClicksText().replace(/\r?\n/g, '\r\n') + '\r\n';
  const anonId = (getAnonId() || 'eforts').replace(/[^0-9A-Za-zא-ת-]/g, '_');
  const date = getFillDateValue() || new Date().toISOString().slice(0, 10);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EFORTS_${anonId}_${date}_clicks.txt`;
  a.click();
  URL.revokeObjectURL(url);
  const status = document.getElementById('downloadStatus');
  if (status) {
    status.className = 'import-status ok';
    status.textContent = 'הקובץ ירד. פתח/י אותו (ייפתח בפנקס הרשימות), סמנ/י הכול והעתק/י לקליקס.';
  }
  const ai = document.getElementById('aiStatus');
  if (ai) ai.textContent = '';
}

function downloadForAI() {
  // BOM like the Clicks file, so Notepad opens the Hebrew as UTF-8.
  const text = '\uFEFF' + buildExportText();
  // Item 8: sanitize (not HTML-escape) for a filename — strip anything
  // outside letters/digits/hyphen so a pasted "<script>" etc. can't reach
  // the downloaded file's name.
  const anonId = (getAnonId() || 'eforts').replace(/[^0-9A-Za-zא-ת-]/g, '_');
  // her ruling 2026-10-09: the questionnaire's FILL date, not today's
  const date = getFillDateValue() || new Date().toISOString().slice(0, 10);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `EFORTS_${anonId}_${date}_AI.txt`;
  a.click();
  URL.revokeObjectURL(url);
  const status = document.getElementById('aiStatus');
  if (status) {
    status.className = 'import-status ok';
    status.textContent = 'הקובץ ירד — העל/י אותו לכלי ה-AI וכתוב/י לו מה נצפה במפגש.';
  }
}

// ===== PARENT RESULTS SHEET =====
// A short, number-free summary to hand parents in or after the meeting.
// Two levels only (as expected for age / harder than expected). Built from
// the same scores, cutoffs and cutoffStatus() as everything else; item
// wording comes from itemPhrases(). Never shows scores, cutoffs, item
// numbers, the anonymous number or the clinical summary.
const PARENT_ROUTINES = [
  { key: 'morning', name: 'שגרת בוקר וערב', inBrief: 'שגרת הבוקר והערב' },
  { key: 'play', name: 'שגרת פנאי ומשחק', inBrief: 'שגרת הפנאי והמשחק' },
  { key: 'social', name: 'שגרה חברתית', inBrief: 'השגרה החברתית' },
];
const PARENT_SKILLS = [
  {
    key: 'inh',
    name: 'עצירה לפני תגובה (עכבה)',
    desc: 'להתעלם מהסחות, לסיים דבר אחד לפני שעוברים לבא ולעצור לחשוב לפני שמגיבים.',
  },
  {
    key: 'wm',
    name: 'החזקת מידע בראש (זיכרון עבודה)',
    desc: 'לזכור מה צריך לעשות ובאיזה סדר, ולהתמיד בלי תזכורות.',
  },
  {
    key: 'flex',
    name: 'יוזמה וגמישות (גמישות מחשבתית)',
    desc: 'ליזום, לתכנן ולמצוא פתרון כשמשהו לא מסתדר.',
  },
];

function buildParentSheetHtml(p) {
  const { sexRaw, ageText, fillDateText, scores, c, note } = p;
  const contactText = (p.contact || '').trim();
  const G = (m, f, unset) => (sexRaw === 'male' ? m : sexRaw === 'female' ? f : unset);
  const CHILD = G('בנכם', 'בתכם', 'ילדכם');
  const TO_CHILD = G('לבנכם', 'לבתכם', 'לילדכם');
  const MANAGES = G('מתנהל', 'מתנהלת', 'מתנהל/ת');
  const AGE = G('לגילו', 'לגילה', 'לגילו/ה');
  const SUCCEEDS = G('מצליח', 'מצליחה', 'מצליח/ה');
  const { diffPhrase, strengthPhrase } = itemPhrases(sexRaw !== 'female');
  const e = escapeHtml;

  const routineAvg = (key) => avg(items.filter((i) => i.routine === key).map((i) => scores[i.num]));
  const skillAvg = (key) => avg(items.filter((i) => i.ef === key).map((i) => scores[i.num]));
  const routines = PARENT_ROUTINES.map((r) => ({
    ...r,
    below: cutoffStatus(routineAvg(r.key), c[r.key], 'routine').key === 'below',
  }));
  const skills = PARENT_SKILLS.map((s) => ({
    ...s,
    below: cutoffStatus(skillAvg(s.key), c[s.key], 'ef').key === 'below',
  }));
  const totalAvg = avg(PARENT_ROUTINES.map((r) => routineAvg(r.key)));
  const totalBelow = cutoffStatus(totalAvg, c.total, 'total').key === 'below';
  const anyRoutine = routines.some((r) => r.below);
  const anySkill = skills.some((s) => s.below);

  let brief;
  let mode;
  if (anyRoutine) {
    mode = 'B';
    const lowRoutines = routines.filter((r) => r.below);
    brief =
      lowRoutines.length === 1
        ? `על פי התשובות שלכם, ${lowRoutines[0].inBrief} קשה ${TO_CHILD} יותר מהצפוי ${AGE}. הפירוט בהמשך.`
        : `על פי התשובות שלכם, יש שגרות שקשות ${TO_CHILD} יותר מהצפוי ${AGE}. הפירוט בהמשך.`;
  } else if (anySkill) {
    mode = 'C';
    brief = `על פי התשובות שלכם, ${CHILD} ${MANAGES} בשגרות היום-יום כצפוי ${AGE}, ועם זאת עלה קושי ${skills.filter((x) => x.below).length === 1 ? 'באחת המיומנויות' : 'בחלק מהמיומנויות'}. הפירוט בהמשך.`;
  } else if (totalBelow) {
    mode = 'D';
    brief = `על פי התשובות שלכם, התמונה הכללית מעט נמוכה מהצפוי ${AGE}, גם אם אף שגרה לבדה אינה בולטת. נשוחח על כך יחד.`;
  } else {
    mode = 'A';
    brief = `על פי התשובות שלכם, ${CHILD} ${MANAGES} בשגרות היום-יום כצפוי ${AGE}.`;
  }

  // What's going well: routines not below cutoff, then up to 3 strengths.
  const goodLines = routines.filter((r) => !r.below).map((r) => `${r.name}: כצפוי לגיל.`);
  // Same rule as the clinical summary (S1): a strength is shown only if its
  // function is clearly in norm; items 10/11 follow working memory; an item
  // whose twin scored 1-2 is skipped.
  const skillNorm = (key) => cutoffStatus(skillAvg(key), c[key], 'ef').key === 'norm';
  const strengthOk = (i) => {
    const ef = i.ef || (i.num === 10 || i.num === 11 ? 'wm' : null);
    if (ef && !skillNorm(ef)) return false;
    const tw = ITEM_TWIN[i.num];
    return !(tw != null && scores[tw] <= 2);
  };
  const strongItems = items
    .filter((i) => scores[i.num] >= 4 && strengthOk(i))
    .sort((a, b) => scores[b.num] - scores[a.num] || a.num - b.num);
  const strengths = [];
  strongItems.forEach((i) => {
    const ph = strengthPhrase[i.num];
    if (strengths.length < 3 && !strengths.includes(ph)) strengths.push(ph);
  });
  strengths.forEach((ph) => goodLines.push(`${SUCCEEDS} ${ph}.`));
  const goodHtml = goodLines.length
    ? `<ul>${goodLines.map((l) => `<li>${e(l)}</li>`).join('')}</ul>`
    : `<p>נשוחח יחד גם על מה שהולך טוב: חלק מזה לא נמדד בשאלון.</p>`;

  // What's harder than expected (B: routines, C: skills).
  const harderBlock = (title, itemList) => {
    const hard = itemList
      .filter((i) => scores[i.num] <= 2)
      .sort((a, b) => scores[a.num] - scores[b.num] || a.num - b.num);
    const ex = [];
    hard.forEach((i) => {
      const ph = diffPhrase[i.num];
      if (ex.length < 2 && !ex.includes(ph)) ex.push(ph);
    });
    return (
      `<p class="hard">${e(title)}: קשה יותר מהצפוי לגיל — כדאי לדבר על זה.</p>` +
      (ex.length
        ? `<p class="eg">למשל, לפי התשובות שלכם:</p><ul>${ex.map((x) => `<li>${e(x)}.</li>`).join('')}</ul>`
        : '<p class="eg">התמונה עולה מכמה תשובות יחד, ולא מתשובה אחת בולטת.</p>')
    );
  };
  let harderHtml = '';
  if (mode === 'B') {
    harderHtml = routines
      .filter((r) => r.below)
      .map((r) =>
        harderBlock(
          r.name,
          items.filter((i) => i.routine === r.key),
        ),
      )
      .join('');
  } else if (mode === 'C') {
    harderHtml = skills
      .filter((s) => s.below)
      .map((s) =>
        harderBlock(
          s.name,
          items.filter((i) => i.ef === s.key),
        ),
      )
      .join('');
  }

  const chip = (below) =>
    below
      ? '<span class="chip chip-hard">קשה יותר מהצפוי</span>'
      : '<span class="chip chip-ok">כצפוי לגיל</span>';
  const skillsHtml = skills
    .map(
      (s) =>
        `<div class="skill"><div class="skill-head"><b>${e(s.name)}</b>${chip(s.below)}</div><div class="skill-desc">${e(s.desc)}</div></div>`,
    )
    .join('');

  const noteText = (note || '').trim();
  const noteHtml = noteText
    ? `<p class="note-label">הערה מהמטפל/ת:</p><p class="note">${e(noteText).split('\n').join('<br>')}</p>`
    : '';

  const sexWord = sexRaw === 'male' ? 'בן' : sexRaw === 'female' ? 'בת' : '';
  const meta = [[sexWord, ageText].filter(Boolean).join(' '), `תאריך מילוי: ${fillDateText}`]
    .filter(Boolean)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>סיכום התוצאות להורים — EFORTS ${fillDateText}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 10mm; }
  body { font-family: 'Heebo', sans-serif; direction: rtl; color: #1a202c; line-height: 1.45; padding: 18px; max-width: 760px; margin: 0 auto; font-size: 13px; }
  .head { text-align: center; margin-bottom: 8px; }
  .logos { display: flex; align-items: flex-end; justify-content: center; gap: 14px; margin-bottom: 6px; }
  .logos img { height: 28px; width: auto; max-width: 100px; object-fit: contain; }
  .q-title { font-size: 12px; font-weight: 700; margin-top: 4px; line-height: 1.4; }
  .q-authors { font-size: 11px; color: #475569; margin-top: 2px; }
  h1 { text-align: center; font-size: 20px; margin: 10px 0 2px; }
  .meta { text-align: center; font-size: 12px; color: #475569; margin-bottom: 10px; }
  h2 { font-size: 14px; font-weight: 700; color: #0f4c75; margin: 12px 0 4px; padding-bottom: 2px; border-bottom: 1px solid #94a3b8; }
  p { margin: 0 0 4px; }
  ul { margin: 0 18px 4px 0; padding: 0; }
  li { margin-bottom: 2px; }
  .hard { font-weight: 600; margin-top: 6px; }
  .eg { color: #475569; }
  .skill { margin-bottom: 6px; }
  .skill-head { display: flex; justify-content: flex-start; align-items: center; gap: 10px; }
  .child-name { margin: 6px 0 10px; font-size: 13px; text-align: right; }
  .skill-desc { color: #475569; }
  .chip { display: inline-block; white-space: nowrap; font-size: 11px; font-weight: 700; padding: 1px 9px; border-radius: 10px; border: 1.5px solid; }
  .chip-ok { color: #1b5e20; border-color: #2e7d32; }
  .chip-hard { color: #8a5a00; border-color: #c27c00; }
  .note-label { font-weight: 700; margin-top: 6px; }
  .note { border: 1px solid #94a3b8; border-radius: 6px; padding: 6px 10px; }
  .footer { text-align: center; font-size: 10px; color: #64748b; margin-top: 14px; padding-top: 6px; border-top: 1px solid #cbd5e1; }
  section { break-inside: avoid; }
  @media print { body { padding: 0; max-width: none; font-size: 12px; line-height: 1.4; } h1 { margin: 6px 0 2px; } h2 { margin: 8px 0 3px; } .skill { margin-bottom: 4px; } }
</style>
</head>
<body>
  <div class="head">
    <div class="logos">
      <img src="assets/haifa.jpg" alt="אוניברסיטת חיפה">
      <img src="assets/chap.png" alt="המעבדה לתפקוד אנושי מורכב (CHAP)">
      <img src="assets/clalit.svg" alt="שירותי בריאות כללית">
    </div>
    <div class="q-title">שאלון למדידת יכולת הניהול העצמי של ילדים בשגרות היום יום (EFORTS)</div>
    <div class="q-authors">כרמית פריש ופרופ' שרה רוזנבלום, אוניברסיטת חיפה</div>
  </div>
  <h1>סיכום התוצאות להורים</h1>
  <div class="meta">${e(meta)}</div>
  <div class="child-name">שם הילד/ה: ________________</div>

  <section><h2>מה זה הסיכום הזה</h2>
  <p>הסיכום מבוסס על התשובות שלכם בשאלון. זהו שאלון סינון: הוא עוזר להבין איך ${CHILD} ${MANAGES} בשגרות היום-יום, אבל הוא אינו אבחנה ואינו מעיד על ההורות שלכם. תקופה עמוסה, מחלה או שבוע קשה יכולים להשפיע על התשובות.</p></section>

  <section><h2>בקצרה</h2><p>${brief}</p></section>

  <section><h2>מה הולך טוב</h2>${goodHtml}</section>

  ${harderHtml ? `<section><h2>מה קשה יותר מהצפוי</h2>${harderHtml}</section>` : ''}

  <section><h2>שלוש המיומנויות שהשאלון בודק</h2>${skillsHtml}</section>

  <section><h2>מה הלאה</h2>
  <p>נשוחח יחד על התוצאות, על מה שראינו במפגש ועל ההמשך.</p>${noteHtml}</section>

  ${contactText ? `<section><p><b>לשאלות: ${e(contactText)}</b></p></section>` : '<section><h2>לשאלות</h2><p>אפשר לפנות לצוות הריפוי בעיסוק.</p></section>'}

  <div class="footer">EFORTS — Frisch &amp; Rosenblum, 2014 · הסיכום נכתב להורים ואינו מחליף את דוח האבחון.</div>
</body>
</html>`;
}

function printParentResults() {
  const btn = document.querySelector('.btn-parent-pdf');
  btn.disabled = true;
  btn.textContent = 'מכין להדפסה…';
  try {
    const scores = {};
    items.forEach((item) => {
      const checked = document.querySelector(`input[name="q${item.num}"]:checked`);
      if (checked) scores[item.num] = parseInt(checked.value);
    });
    const fillIso = getFillDateValue();
    const fd = new Date(fillIso || Date.now());
    const two = (n) => String(n).padStart(2, '0');
    const html = buildParentSheetHtml({
      sexRaw: document.getElementById('childGender').value,
      ageText: document.getElementById('calcAge').textContent,
      fillDateText: `${two(fd.getDate())}/${two(fd.getMonth() + 1)}/${fd.getFullYear()}`,
      scores,
      c: cutoffs[document.getElementById('ageGroup').value],
      note: document.getElementById('parentNote').value,
      contact: document.getElementById('parentContact').value, // printed only, never stored
    });
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('הדפדפן חסם את חלון ההדפסה. יש לאפשר חלונות קופצים לאתר זה ולנסות שוב.');
    } else {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 600);
    }
  } catch (err) {
    alert('שגיאה ביצירת PDF: ' + err.message);
  }
  btn.disabled = false;
  btn.textContent = 'PDF להורים';
}

async function printResults() {
  const btn = document.querySelector('.btn-pdf');
  btn.disabled = true;
  btn.textContent = 'מכין להדפסה…';

  try {
    // Gather all data from the current results. Item 8: escape here too —
    // this feeds both the print meta line and buildSummary() below.
    const anonId = escapeHtml(getAnonId()) || '—';
    // CSS string for the @page footer: no quotes, backslashes or tags
    const footerAnon = (getAnonId() || '—').replace(/[\s"'\\<>&]/g, '');
    const genderRaw = document.getElementById('childGender').value;
    const gender = genderText(genderRaw);
    const ageText = document.getElementById('calcAge').textContent;
    const ageLabel = document.getElementById('ageGroupDisplay').textContent;
    const ageGroup = document.getElementById('ageGroup').value;
    const c = cutoffs[ageGroup];

    const scores = {};
    items.forEach((item) => {
      const checked = document.querySelector(`input[name="q${item.num}"]:checked`);
      if (checked) scores[item.num] = parseInt(checked.value);
    });

    const morningAvg = avg(items.filter((i) => i.routine === 'morning').map((i) => scores[i.num]));
    const playAvg = avg(items.filter((i) => i.routine === 'play').map((i) => scores[i.num]));
    const socialAvg = avg(items.filter((i) => i.routine === 'social').map((i) => scores[i.num]));
    const totalAvg = avg([morningAvg, playAvg, socialAvg]);
    const inhAvg = avg(items.filter((i) => i.ef === 'inh').map((i) => scores[i.num]));
    const wmAvg = avg(items.filter((i) => i.ef === 'wm').map((i) => scores[i.num]));
    const flexAvg = avg(items.filter((i) => i.ef === 'flex').map((i) => scores[i.num]));

    const isMale = document.getElementById('childGender').value === 'male';
    const summaryHtml = buildSummary({
      anonId,
      gender,
      isMale,
      sexUnset: !document.getElementById('childGender').value,
      ageText,
      ageLabel,
      morningAvg,
      playAvg,
      socialAvg,
      totalAvg,
      inhAvg,
      wmAvg,
      flexAvg,
      c,
      scores,
    });

    // Score level helpers
    const scoreNames = ['', 'אף פעם', 'לעיתים רחוקות', 'לפעמים', 'לעיתים קרובות', 'תמיד'];
    const _efLabels = { inh: 'עכבה', wm: 'זיכרון עבודה', flex: 'גמישות מחשבתית' };
    const _routineLabels = { morning: 'בוקר וערב', play: 'פנאי ומשחק', social: 'שגרה חברתית' };

    // Group items by score level
    const weakItems = items
      .filter((i) => scores[i.num] <= 2)
      .sort((a, b) => scores[a.num] - scores[b.num]);
    const midItems = items.filter((i) => scores[i.num] === 3);
    const strongItems = items
      .filter((i) => scores[i.num] >= 4)
      .sort((a, b) => scores[b.num] - scores[a.num]);

    // S-11: the print copy of B8 — same cutoffStatus() source as the screen.
    // Item 10: match the screen's --red/--amber/--green exactly, not a
    // separate print-only palette.
    const PRINT_COLOR = { warn: '#c62828', mid: '#f57f17', ok: '#2e7d32' };
    const levelText = (sc, ct, kind) => {
      const st = cutoffStatus(sc, ct, kind);
      return st.key === 'below' ? `${st.text} ⚠` : st.key === 'norm' ? `${st.text} ✓` : st.text;
    };
    const levelColor = (sc, ct, kind) => PRINT_COLOR[cutoffStatus(sc, ct, kind).cls];

    // Build score rows for the table
    const scoreTableRows = [
      { label: 'בוקר וערב', sc: morningAvg, ct: c.morning, kind: 'routine' },
      { label: 'פנאי ומשחק', sc: playAvg, ct: c.play, kind: 'routine' },
      { label: 'שגרה חברתית', sc: socialAvg, ct: c.social, kind: 'routine' },
      { label: 'ציון כולל', sc: totalAvg, ct: c.total, kind: 'total' },
    ];
    const efTableRows = [
      { label: 'עכבה', sc: inhAvg, ct: c.inh, kind: 'ef' },
      { label: 'זיכרון עבודה', sc: wmAvg, ct: c.wm, kind: 'ef' },
      { label: 'גמישות מחשבתית', sc: flexAvg, ct: c.flex, kind: 'ef' },
    ];

    const buildScoreTable = (rows) =>
      rows
        .map(
          (r) =>
            `<tr>
        <td style="padding:4px 10px;font-weight:600;text-align:right;">${r.label}</td>
        <td style="padding:4px 10px;text-align:center;color:${levelColor(r.sc, r.ct, r.kind)};font-weight:700;">${fmtScore(r.sc, r.ct)}</td>
        <td style="padding:4px 10px;text-align:center;color:#666;">${r.ct.toFixed(2)}</td>
        <td style="padding:4px 10px;text-align:center;color:${levelColor(r.sc, r.ct, r.kind)};">${levelText(r.sc, r.ct, r.kind)}</td>
      </tr>`,
        )
        .join('');

    const buildItemRows = (itemList, bgColor) =>
      itemList
        .map(
          (item) =>
            `<tr style="background:${bgColor};">
        <td style="padding:4px 8px;text-align:center;color:#888;font-size:11px;">${item.num}</td>
        <td style="padding:4px 8px;text-align:right;font-size:11px;line-height:1.5;">${item.text}</td>
        <td style="padding:4px 8px;text-align:center;font-size:11px;">${_routineLabels[item.routine]}</td>
        <td style="padding:4px 8px;text-align:center;font-size:11px;">${_efLabels[item.ef] || 'לא כלול'}</td>
        <td style="padding:4px 8px;text-align:center;font-weight:700;font-size:12px;color:${scores[item.num] <= 2 ? '#c0392b' : scores[item.num] === 3 ? '#d35400' : '#27ae60'};">${scores[item.num]}</td>
        <td style="padding:4px 8px;text-align:center;font-size:10px;color:#888;">${scoreNames[scores[item.num]]}</td>
      </tr>`,
        )
        .join('');

    // P-07: the fill date, not today's date — the age is computed from it.
    const fillIso = getFillDateValue();
    // one date format in both PDFs: dd/mm/yyyy (same as the parent sheet)
    const fillParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(fillIso || '');
    const fillDateText = fillParts
      ? `${fillParts[3]}/${fillParts[2]}/${fillParts[1]}`
      : new Date().toLocaleDateString('en-GB');

    // O12: the title becomes the suggested file name in «שמירה כ-PDF».
    const titleId = (getAnonId() || 'eforts').replace(/[^0-9A-Za-zא-ת-]/g, '_');
    const titleDate = fillParts ? fillIso : new Date().toISOString().slice(0, 10);

    // Build a minimal, print-optimized HTML document
    const printHtml = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>EFORTS_${titleId}_${titleDate}_למטפל</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Heebo', sans-serif; direction: rtl; color: #1a202c; line-height: 1.6; padding: 20px; max-width: 800px; margin: 0 auto; }
  h1 { text-align: center; font-size: 18px; margin-bottom: 4px; }
  .meta { text-align: center; font-size: 12px; color: #666; margin-bottom: 16px; }
  .print-header { text-align: center; margin-bottom: 12px; }
  .print-header-logos { display: flex; align-items: flex-end; justify-content: center; gap: 14px; margin-bottom: 8px; }
  .print-header-logos img { height: 28px; width: auto; max-width: 100px; object-fit: contain; }
  .print-header-title { font-size: 15px; font-weight: 700; color: #1a202c; margin-top: 8px; line-height: 1.4; }
  .print-header-authors { font-size: 12px; font-weight: 700; color: #1a202c; margin-top: 6px; }
  .print-header-lab { font-size: 10px; font-weight: 500; color: #64748b; margin-top: 1px; }
  .print-header-citation { font-size: 9px; font-weight: 300; color: #64748b; margin-top: 3px; }
  .print-header-credit { font-size: 9px; font-weight: 300; color: #5a6a7e; margin-top: 4px; line-height: 1.4; }
  .section-title { font-size: 14px; font-weight: 700; color: #0077b6; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #0077b6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #f0f4f8; padding: 6px 10px; font-size: 11px; font-weight: 600; color: #444; text-align: center; border-bottom: 2px solid #ddd; }
  td { border-bottom: 1px solid #eee; }
  .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 12px; line-height: 1.8; break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .page-footer { display: none; }
  .summary-box p { margin: 0 0 10px; break-inside: avoid; page-break-inside: avoid; orphans: 3; widows: 3; }
  .summary-box p:last-child { margin-bottom: 0; }
  .group-header { font-size: 12px; font-weight: 700; padding: 6px 10px; margin-top: 8px; }
  .group-weak { color: #c0392b; background: #fff5f5; }
  .group-mid { color: #d35400; background: #fffbeb; }
  .group-strong { color: #27ae60; background: #f0fdf4; }
  .footer { text-align: center; font-size: 10px; color: #aaa; margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee; }
  @page { size: A4; margin: 10mm 10mm 18mm; @bottom-center { content: "EFORTS · מטופל מס' ${footerAnon} · תאריך מילוי ${fillDateText}"; font-size: 10px; color: #475569; } }
  @media print { body { padding: 10px; } .page-footer { display: none; } }
</style>
</head>
<body>
  <div class="page-footer">EFORTS · מטופל מס' ${anonId} · תאריך מילוי ${fillDateText}</div>
  <div class="print-header">
    <div class="print-header-logos">
      <img src="assets/haifa.jpg" alt="אוניברסיטת חיפה">
      <img src="assets/chap.png" alt="המעבדה לתפקוד אנושי מורכב (CHAP)">
      <img src="assets/clalit.svg" alt="שירותי בריאות כללית">
    </div>
    <div class="print-header-title">שאלון למדידת יכולת הניהול העצמי של ילדים בשגרות היום יום</div>
    <div class="print-header-authors">כרמית פריש ופרופ' שרה רוזנבלום, אוניברסיטת חיפה</div>
    <div class="print-header-lab">המעבדה לתפקוד אנושי מורכב (CHAP), אוניברסיטת חיפה</div>
    <div class="print-header-citation">Frisch &amp; Rosenblum, 2014</div>
    <div class="print-header-credit">תהליך מחשוב השאלון בוצע ע"י אליסון אלט, מרפאה בעיסוק בשירותי בריאות כללית מחוז ירושלים, בתיאום ואישור המחברות.</div>
  </div>
  <h1>תוצאות שאלון EFORTS</h1>
  <div class="meta">${patientNoun(genderRaw)} מס' ${anonId} | ${sexWord(genderRaw)} | ${ageText} | קבוצת גיל: <bdi dir="ltr">${ageLabel}</bdi> | תאריך מילוי: ${fillDateText}</div>

  <div class="section-title">ציונים</div>
  <table>
    <tr><th style="text-align:right;">שגרה</th><th>ציון</th><th>ציון החתך</th><th>מצב</th></tr>
    ${buildScoreTable(scoreTableRows)}
    <tr><td colspan="4" style="padding:2px;border:none;"></td></tr>
    <tr><th style="text-align:right;">תפקוד ניהולי</th><th>ציון</th><th>ציון החתך</th><th>מצב</th></tr>
    ${buildScoreTable(efTableRows)}
  </table>

  <div class="section-title">סיכום קליני</div>
  <div class="summary-box">${summaryHtml}</div>

  <div class="section-title">פירוט הפריטים לפי ציון</div>
  <table>
    <thead><tr><th style="width:30px;">#</th><th style="text-align:right;">פריט</th><th style="width:80px;">שגרה</th><th style="width:80px;">תפקוד ניהולי</th><th style="width:40px;">ציון</th><th style="width:70px;">תשובה</th></tr></thead>
    ${weakItems.length > 0 ? `<tr><td colspan="6" class="group-header group-weak">ציון 1–2 (קושי) — ${nItems(weakItems.length)}</td></tr>` + buildItemRows(weakItems, '#fff5f5') : ''}
    ${midItems.length > 0 ? `<tr><td colspan="6" class="group-header group-mid">ציון 3 — ${nItems(midItems.length)}</td></tr>` + buildItemRows(midItems, '#fffbeb') : ''}
    ${strongItems.length > 0 ? `<tr><td colspan="6" class="group-header group-strong">ציון 4–5 (חוזקה) — ${nItems(strongItems.length)}</td></tr>` + buildItemRows(strongItems, '#f0fdf4') : ''}
  </table>

  <div class="footer">
    EFORTS — Frisch & Rosenblum, 2014 | נורמות: Frisch & Rosenblum, 2024 | ציון החתך נקבע 1.5 סטיות תקן מתחת לממוצע של קבוצת הגיל | פריטים 10 ו-11 אינם נכללים בחישוב התפקודים הניהוליים
  </div>
</body>
</html>`;

    // Open a clean print window — user saves as PDF via browser print dialog.
    // Item 10: a popup blocker makes window.open() return null; without
    // this guard the next line throws and the catch below shows a raw
    // "Cannot read properties of null" instead of a message she can act on.
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('הדפדפן חסם את חלון ההדפסה. יש לאפשר חלונות קופצים לאתר זה ולנסות שוב.');
      btn.disabled = false;
      btn.textContent = 'PDF למטפל/ת';
      return;
    }
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();

    // Wait for fonts to load, then trigger print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 600);
  } catch (e) {
    alert('שגיאה ביצירת PDF: ' + e.message);
  }

  btn.disabled = false;
  btn.textContent = 'PDF למטפל/ת';
}

function toggleDrill(id) {
  const el = document.getElementById('drill_' + id);
  const arrow = document.getElementById('arrow_' + id);
  const row = document.querySelector(`.score-row[data-drill="${id}"]`);
  if (!el) return;
  if (el.style.display === 'block') {
    el.style.display = 'none';
    if (arrow) arrow.innerHTML = '&#9660;';
    if (row) row.setAttribute('aria-expanded', 'false');
  } else {
    el.style.display = 'block';
    if (arrow) arrow.innerHTML = '&#9650;';
    if (row) row.setAttribute('aria-expanded', 'true');
  }
}

// Enter / Space on a focused score row opens it (the row is role="button").
function drillKey(e, id) {
  if (e.target !== e.currentTarget) return; // the «?» tip inside keeps its own keys
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleDrill(id);
  }
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// R-01 (TM-spec §A-11): one gender/patient-noun source, used everywhere a
// "—"/"נקבה" fallback used to hide an unset sex.
function genderText(raw) {
  return raw === 'male' ? 'זכר' : raw === 'female' ? 'נקבה' : 'מין לא צוין';
}
// Screen/PDF header wording for the sex (the stored values and the summary
// text keep their own forms).
function sexWord(raw) {
  return raw === 'male' ? 'בן' : raw === 'female' ? 'בת' : 'מין לא צוין';
}
function patientNoun(raw) {
  return raw === 'male' ? 'מטופל' : raw === 'female' ? 'מטופלת' : 'מטופל/ת';
}

// UX2-7: the progress bar is sticky. A target that comes AFTER the bar in the
// page must land fully below it (bar height + 16px); a target above the bar is
// never covered by it. Mirrored in CSS as --bar-offset (scroll-margin-top).
function barOffset() {
  const bar = document.getElementById('progressWrap');
  const h = bar && bar.offsetHeight ? bar.offsetHeight : 0;
  return h + 16;
}

function scrollBelowProgress(el) {
  const bar = document.getElementById('progressWrap');
  const afterBar =
    bar &&
    bar.offsetHeight &&
    bar.compareDocumentPosition(el) & window.Node.DOCUMENT_POSITION_FOLLOWING;
  const off = afterBar ? barOffset() : 16;
  const top = el.getBoundingClientRect().top + window.scrollY - off;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function syncBarOffset() {
  document.documentElement.style.setProperty('--bar-offset', barOffset() + 'px');
}
window.addEventListener('resize', syncBarOffset);
window.addEventListener('load', syncBarOffset);

function firstEmpty(ids) {
  return ids.find((id) => !document.getElementById(id).value) || ids[0];
}

function clearFieldMarks() {
  document.querySelectorAll('.field-invalid').forEach((el) => {
    el.classList.remove('field-invalid');
    el.removeAttribute('aria-invalid');
  });
}

// O10: a warning about a field goes UNDER that field, which is scrolled to,
// focused and marked. (#warning is the same one element, moved there.)
function showWarning(msg, fieldId) {
  const w = document.getElementById('warning');
  clearFieldMarks();
  w.textContent = msg;
  w.style.display = 'block';
  const field = fieldId && document.getElementById(fieldId);
  if (!field) {
    scrollBelowProgress(w);
    return;
  }
  const row = field.closest('.date-row') || field;
  const host = field.closest('.info-field') || row.parentNode;
  host.appendChild(w);
  field.classList.add('field-invalid');
  field.setAttribute('aria-invalid', 'true');
  w.setAttribute('role', 'alert');
  scrollBelowProgress(row);
  field.focus({ preventScroll: true });
}

function showMissingWarning(missing) {
  const w = document.getElementById('warning');
  const first = missing[0];
  const q = document.getElementById('questionnaire');
  if (q.hidden) setFold(false);
  showWarning(`חסרות תשובות לפריטים: ${missing.join(', ')}`);
  const row = document.getElementById(`q${first}_1`)?.closest('.item-row');
  if (row) {
    clearFieldMarks();
    missing.forEach((n) =>
      document.getElementById(`q${n}_1`)?.closest('.item-row')?.classList.add('field-invalid'),
    );
    row.parentNode.insertBefore(w, row.nextSibling);
    w.style.display = 'block';
    scrollBelowProgress(row);
    document.getElementById(`q${first}_1`).focus({ preventScroll: true });
  }
}

function hideWarning() {
  document.getElementById('warning').style.display = 'none';
  clearFieldMarks();
}

function goBack() {
  document.getElementById('results').style.display = 'none';
  document.getElementById('formSection').style.display = 'block';
  document.getElementById('progressWrap').style.display = '';
  document.body.classList.remove('showing-results');
  setFold(false);
  syncBarOffset();
  scrollBelowProgress(document.getElementById('questionnaire'));
}

function resetForm() {
  if (!confirm('לאפס את כל התשובות ולהתחיל שאלון חדש? הנתונים השמורים בלשונית זו יימחקו.')) return;
  storeRemove('eforts_save');
  parentNoteDraft = '';
  hideRestoreBar();
  document.querySelectorAll('input[type="radio"]').forEach((r) => (r.checked = false));
  document.getElementById('anonId').value = '';
  document.getElementById('childGender').value = '';
  document.getElementById('birthDay').value = '';
  document.getElementById('birthMonth').value = '';
  document.getElementById('birthYear').value = '';
  clearAgeDisplay();
  setFillDateToToday();
  ['morning', 'play', 'social'].forEach((k) => {
    const el = document.getElementById('companion_' + k);
    if (el) el.value = '';
  });
  clearSendStatus();
  document.getElementById('importCode').value = '';
  clearImportPanel();
  importPreviewData = null;
  document.getElementById('results').style.display = 'none';
  document.getElementById('formSection').style.display = 'block';
  document.getElementById('progressWrap').style.display = '';
  document.body.classList.remove('showing-results');
  hideWarning();
  clearFold();
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== IMPORT PARENT ANSWERS (PF2) =====
// Decodes an EFORTS1 code from parent.html (sex + dob + date + with + 30
// answers — see eforts-code.js's header comment; there is no anonymous
// id in the format, AMENDED 2026-09-28 12:31) and fills this form. The
// therapist types the anonymous number herself: import never touches
// #anonId, and calculate() is never called automatically (dob here is
// the parent's real answer, not an estimate that needs correcting).

let importPreviewData = null;

const FIELD_NAMES_HE = {
  sex: 'מין',
  dob: 'תאריך לידה',
  date: 'תאריך מילוי',
  with: 'מי נמצא עם הילד',
  a: 'תשובות',
};

function importErrorText(code, params) {
  const p = params || {};
  switch (code) {
    case 'E0':
      return 'לא הודבק טקסט.';
    case 'E1':
      return 'לא נמצא קוד תשובות. העתק/י את כל שורת הקוד שבתחתית ה-PDF.';
    case 'E2':
      return `הקוד נוצר בגרסה אחרת של טופס ההורים (${p.found}) ולא ניתן לייבא אותו כאן.`;
    case 'E3':
      if (p.fromFile) return 'הקובץ נפגם או נערך. בקש/י מההורים לשלוח אותו שוב.';
      return 'הקוד השתנה או נקטע בדרך. נסה/י להעתיק שוב, או בקש/י מההורים לשלוח שוב את הקובץ.';
    case 'E4':
      return `חסר שדה בקוד, או ששדה לא במקומו: ${FIELD_NAMES_HE[p.key] || p.key}.`;
    case 'E5':
      return `ערך לא תקין בשדה מין: "${p.v}".`;
    case 'E6':
      return `בקוד יש ${p.n} תשובות במקום 30.`;
    case 'E7':
      return `תשובה לא תקינה לשאלה ${p.num}: "${p.v}" (מותר 1 עד 5).`;
    case 'E8':
      // The pinned E8 text in PF-spec §H.3 covers an "age Y;M" field that
      // no longer exists (AMENDED 2026-09-28: dob replaces age). E8 is now
      // the codec's invalid-date-of-birth error, so the message names dob.
      return `תאריך לידה לא תקין: "${p.v}".`;
    case 'E9':
      return `תאריך מילוי לא תקין: "${p.v}".`;
    case 'E10':
      if (p.future) return 'תאריך המילוי בעתיד. בדוק/י את התאריך בקובץ.';
      return `תאריך המילוי (${formatDMY(p.v)}) ישן מדי — הטופס תומך עד 3 שנים אחורה.`;
    case 'E12':
      return 'ערך לא תקין בשדה "מי נמצא עם הילד".';
    case 'E13':
      return 'נמצאו כמה קודים שונים. הדבק/י קוד אחד בכל פעם.';
    case 'E14':
      return 'תאריך הלידה מאוחר מתאריך המילוי.';
    case 'F1':
      return 'הקובץ גדול מדי — זה לא קובץ תשובות של טופס ההורים.';
    case 'F4':
      return 'זה לא קובץ תשובות. יש לבחור את קובץ ה-PDF שההורים שלחו.';
    case 'F2':
      return 'לא הצלחנו לקרוא את הקובץ.';
    case 'F5':
      return 'זה הסיכום להורים, לא קובץ התשובות. יש להעלות את קובץ התשובות שההורים שלחו.';
    case 'F3':
      return 'לא נמצא קוד בקובץ. פתח/י את ה-PDF, העתק/י את שורת הקוד שבתחתית העמוד והדבק/י אותה כאן.';
    default:
      return 'שגיאה לא צפויה בקריאת הקוד.';
  }
}

// Same years/months arithmetic as updateAge() above, duplicated (not
// called) so the import preview can show age before anything is written
// to the birth-date fields.
function computeAgeYM(dobStr, dateStr) {
  const birth = new Date(dobStr);
  const fill = new Date(dateStr);
  let years = fill.getFullYear() - birth.getFullYear();
  let months = fill.getMonth() - birth.getMonth();
  if (fill.getDate() < birth.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months };
}

// Age-band boundaries in total months: 3y0m, 6y0m, 8y0m, 12y0m (the
// instrument's own cutoffs, cutoffs const above / updateAge()'s
// totalYears thresholds). "Near" = within 1 month either side.
const AGE_BAND_EDGE_MONTHS = [36, 72, 96, 144];
function isNearAgeBandEdge(years, months) {
  const total = years * 12 + months;
  return AGE_BAND_EDGE_MONTHS.some((edge) => Math.abs(total - edge) <= 1);
}

const AGE_OUT_OF_RANGE_TEXT = 'הגיל מחוץ לטווח הגילים של השאלון (3 עד 11 שנים ו-11 חודשים).';
const AGE_RANGE_EDGE_TEXT = 'קרוב לגבול טווח הגילים של השאלון — כדאי לוודא את תאריך הלידה.';
const AGE_BAND_EDGE_TEXT =
  'שים/י לב: הגיל קרוב לגבול בין קבוצות גיל, ולכן תאריך הלידה המדויק קובע את ציוני החתך.';

// One note for the import preview and the post-apply status: outside 3.0 to
// 11.11, at the outer edges (3y0m, 11y11m), or near a boundary between bands.
function ageEdgeNote(years, months) {
  const total = years * 12 + months;
  if (total < 36 || total >= 144) return AGE_OUT_OF_RANGE_TEXT;
  if (total <= 37 || total >= 142) return AGE_RANGE_EDGE_TEXT;
  if (isNearAgeBandEdge(years, months)) return AGE_BAND_EDGE_TEXT;
  return '';
}

function showImportEdge(years, months) {
  const edge = document.getElementById('importEdge');
  const note = ageEdgeNote(years, months);
  edge.textContent = note;
  edge.hidden = !note;
}

// 'future' | 'old' | '' for an imported fill date.
function importFillDateProblem(dateStr) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dateStr > today) return 'future';
  if (Number(dateStr.slice(0, 4)) < now.getFullYear() - 3) return 'old';
  return '';
}

function withLabel(code) {
  if (!code) return '—';
  const opt = COMPANION.options.find((o) => o.value === code);
  return opt ? opt.label : '—';
}

function clearSendStatus() {
  const st = document.getElementById('sendStatus');
  if (st) {
    st.textContent = '';
    st.className = 'import-status';
  }
}

function clearImportPanel() {
  const status = document.getElementById('importStatus');
  status.textContent = '';
  status.className = 'import-status';
  document.getElementById('importEdge').hidden = true;
  setPreviewOpen(false);
  clearImportAnonMsg();
}

// UX2-1: while the preview is open the «פרטי המטופל/ת» card is hidden, so the
// only «מספר אנונימי» on screen is the preview's own.
function setPreviewOpen(open) {
  document.getElementById('importPreview').hidden = !open;
  document.body.classList.toggle('previewing', open);
}

function clearImportAnonMsg() {
  const msg = document.getElementById('importAnonMsg');
  if (msg) {
    msg.textContent = '';
    msg.style.display = 'none';
  }
  const f = document.getElementById('importAnon');
  if (f) {
    f.classList.remove('field-invalid');
    f.removeAttribute('aria-invalid');
  }
}

function showImportError(code, params) {
  const status = document.getElementById('importStatus');
  status.className = 'import-status err';
  status.textContent = importErrorText(code, params);
  document.getElementById('importEdge').hidden = true;
  setPreviewOpen(false);
  importPreviewData = null;
}

function buildImportPreview(data) {
  const list = document.getElementById('importPreviewList');
  list.textContent = '';
  const { years, months } = computeAgeYM(data.dob, data.date);
  const [fy, fm, fd] = data.date.split('-');
  const rows = [
    ['מין', data.sex === 'male' ? 'בן' : 'בת'],
    ['גיל לפי ההורה', ageWords(years, months)],
    ['תאריך מילוי', `${fd}/${fm}/${fy}`],
    [
      'מי נמצא עם הילד',
      `בוקר וערב: ${withLabel(data.with.morning)} · משחק ופנאי: ${withLabel(data.with.play)} · חברתית: ${withLabel(data.with.social)}`,
    ],
    ['תשובות', `${data.answers.length} מתוך 30`],
  ];
  rows.forEach(([dt, dd]) => {
    const dtEl = document.createElement('dt');
    dtEl.textContent = dt;
    const ddEl = document.createElement('dd');
    ddEl.textContent = dd;
    list.appendChild(dtEl);
    list.appendChild(ddEl);
  });
}

function openImportBox() {
  document.getElementById('importBox').open = true;
}

function importParentAnswers(text, source) {
  clearImportPanel();
  openImportBox();
  // a code pasted from a quoted reply: drop the leading «>» marks per line
  const result = EFORTSCode.decode(String(text).replace(/^[ \t]*(?:>[ \t]*)+/gm, ''));
  if (!result.ok) {
    showImportError(result.error, { ...result.params, fromFile: source === 'file' });
    return;
  }
  const dateProblem = importFillDateProblem(result.data.date);
  if (dateProblem) {
    showImportError('E10', { v: result.data.date, future: dateProblem === 'future' });
    return;
  }
  if (result.data.dob > result.data.date) {
    showImportError('E14', {});
    return;
  }
  importPreviewData = result.data;
  // O12: a file was read; pasted code was found
  document.getElementById('importPreviewTitle').textContent =
    source === 'file' ? 'הקובץ נקרא. בדוק/י לפני המילוי:' : 'נמצא קוד תקין. בדוק/י לפני המילוי:';
  document.getElementById('importAnon').value = '';
  buildImportPreview(result.data);
  const age = computeAgeYM(result.data.dob, result.data.date);
  showImportEdge(age.years, age.months);
  const preview = document.getElementById('importPreview');
  setPreviewOpen(true);
  scrollBelowProgress(preview);
  document.getElementById('importAnon').focus({ preventScroll: true });
}

function isClinicianFormDirty() {
  const anyRadio = document.querySelector('#questionnaire input[type="radio"]:checked');
  const anonId = getAnonId();
  const gender = document.getElementById('childGender').value;
  const birthDate = getBirthDateValue();
  return !!anyRadio || !!anonId || !!gender || !!birthDate;
}

// O1: fill + calculate in one press. The anonymous number is typed in the
// preview; empty = mark it, focus it, fill nothing.
function applyImportedAnswers() {
  if (!importPreviewData) return;
  const anonField = document.getElementById('importAnon');
  const anon = anonField.value.trim();
  if (!anon) {
    clearImportAnonMsg();
    anonField.classList.add('field-invalid');
    anonField.setAttribute('aria-invalid', 'true');
    const msg = document.getElementById('importAnonMsg');
    msg.textContent = 'יש להזין מספר אנונימי — הוא מופיע בכותרת ובשמות הקבצים במקום שם.';
    msg.style.display = 'block';
    scrollBelowProgress(anonField);
    anonField.focus({ preventScroll: true });
    return;
  }
  if (isClinicianFormDirty()) {
    if (!confirm('הטופס כבר מכיל נתונים. הייבוא יחליף אותם, כולל המספר האנונימי. להמשיך?')) return;
  }
  const data = importPreviewData;

  // O1: a new child is a new number. Never carry the last child's number (or
  // OT note) over; the number is the one typed in the preview.
  document.getElementById('anonId').value = anon;
  parentNoteDraft = '';
  hideRestoreBar();

  document.querySelectorAll('#questionnaire input[type="radio"]').forEach((r) => {
    r.checked = false;
  });

  document.getElementById('childGender').value = data.sex;
  setFillDateValue(data.date);
  setBirthDateValue(data.dob);
  ['morning', 'play', 'social'].forEach((k) => {
    const el = document.getElementById('companion_' + k);
    if (el) el.value = data.with[k] || '';
  });
  data.answers.forEach((val, i) => {
    const radio = document.getElementById(`q${i + 1}_${val}`);
    if (radio) radio.checked = true;
  });

  updateAge();
  updateProgress();
  saveForm();

  const { years, months } = computeAgeYM(data.dob, data.date);
  const status = document.getElementById('importStatus');
  status.className = 'import-status ok';
  status.textContent = 'התשובות הוזנו.';

  showImportEdge(years, months);

  setPreviewOpen(false);
  document.getElementById('importCode').value = '';
  anonField.value = '';
  clearImportAnonMsg();
  importPreviewData = null;

  // the 30 answers fold into one line (expand to edit)
  setFold(true);
  calculate();
}

// ----- O1: fold the 30 answers after an import -----
let foldedByImport = false;

function setFold(folded) {
  const toggle = document.getElementById('foldToggle');
  const q = document.getElementById('questionnaire');
  if (!toggle) return;
  if (folded) foldedByImport = true;
  if (!foldedByImport) return;
  q.hidden = folded;
  toggle.hidden = false;
  toggle.setAttribute('aria-expanded', String(!folded));
  document.getElementById('foldAction').textContent = folded ? 'הצגה ועריכה ▾' : 'הסתרה ▴';
}

function clearFold() {
  foldedByImport = false;
  const toggle = document.getElementById('foldToggle');
  if (toggle) toggle.hidden = true;
  document.getElementById('questionnaire').hidden = false;
}

// ----- PDF answers file -----
// The parent's PDF carries the whole code as one line of real text, so the
// code is found by scanning the file's bytes (read as latin1). A PDF written
// with compressed streams (other tools) is tried second: every Flate stream
// is inflated with the browser's own DecompressionStream and scanned too.
const PDF_CODE_RE = /EFORTS1\|[A-Za-z0-9=|,;:-]+/g;
const PDF_MAX_BYTES = 10 * 1024 * 1024;

function latin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return out;
}

async function inflateBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function codesFromPdf(bytes) {
  const raw = latin1(bytes);
  const direct = raw.match(PDF_CODE_RE);
  if (direct) return direct;

  if (typeof DecompressionStream !== 'function') return [];
  const found = [];
  const streamRe = /obj\s*<<([\s\S]*?)>>\s*stream\r?\n/g;
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    if (!/\/FlateDecode/.test(m[1])) continue;
    const start = m.index + m[0].length;
    let end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    // the end-of-line before "endstream" is not part of the data
    if (raw[end - 1] === '\n') end--;
    if (raw[end - 1] === '\r') end--;
    try {
      const inflated = latin1(await inflateBytes(bytes.subarray(start, end)));
      const hits = inflated.match(PDF_CODE_RE);
      if (hits) found.push(...hits);
    } catch {
      // not a valid Flate stream — skip it
    }
  }
  return found;
}

function looksLikePdf(file, bytes) {
  if (/\.pdf$/i.test(file.name || '') || file.type === 'application/pdf') return true;
  return bytes.length >= 4 && latin1(bytes.subarray(0, 4)) === '%PDF';
}

// The app's own «סיכום התוצאות להורים» sheet carries that title in its PDF
// info (the page text itself is glyph-encoded), as UTF-16 hex or UTF-16BE.
function pdfIsParentSheet(raw) {
  const title = 'סיכום התוצאות להורים';
  let hex = '';
  let be = '';
  for (const ch of title) {
    const c = ch.charCodeAt(0);
    hex += c.toString(16).padStart(4, '0');
    be += String.fromCharCode(c >> 8, c & 255);
  }
  return raw.toLowerCase().includes(hex) || raw.includes(be);
}

async function importFromPdf(file) {
  if (file.size > PDF_MAX_BYTES) {
    showImportError('F1', {});
    return;
  }
  let codes;
  let raw = '';
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    codes = await codesFromPdf(bytes);
    if (!codes.length) raw = latin1(bytes);
  } catch {
    showImportError('F2', {});
    return;
  }
  if (!codes.length) {
    showImportError(pdfIsParentSheet(raw) ? 'F5' : 'F3', {});
    return;
  }
  importParentAnswers(codes.join('\n'), 'file');
}

// One path for a chosen OR dropped answers file (PDF or .txt).
async function importFromFile(file) {
  if (!file) return;
  clearImportPanel();
  openImportBox();
  if (/\.pdf$/i.test(file.name || '') || file.type === 'application/pdf') {
    await importFromPdf(file);
    return;
  }
  // a PDF that lost its name/type: the first bytes still say %PDF
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (looksLikePdf(file, head)) {
      await importFromPdf(file);
      return;
    }
  } catch {
    showImportError('F2', {});
    return;
  }
  // an image or any other file type is not an answers file
  const isTextFile = /\.txt$/i.test(file.name || '') || file.type === 'text/plain';
  if (!isTextFile && (file.type || /\.[A-Za-z0-9]+$/.test(file.name || ''))) {
    showImportError('F4', {});
    return;
  }
  if (file.size > 20000) {
    showImportError('F1', {});
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    showImportError('F2', {});
    return;
  }
  importParentAnswers(text, 'file');
}

// ===== SEND THE QUESTIONNAIRE TO PARENTS =====
// Two plain links: this page's parent link (parent.html: parents fill in, get a
// PDF, send it back however they like) and this page (upload the PDF below).
// The link is built from wherever this page is served (same folder +
// parent.html). Nothing is stored or sent from here.
const S_COPIED = 'הקישור הועתק ✓';
let copiedTimer = null;
const S_COPY_FAIL = 'לא הצלחנו להעתיק אוטומטית. סמנ/י את הקישור שבשדה והעתיק/י אותו.';

function parentLink() {
  return new URL('parent.html', window.location.href).href;
}

function copyParentLink() {
  const link = parentLink();
  const status = document.getElementById('sendStatus');
  const ok = () => {
    status.className = 'import-status ok';
    status.textContent = S_COPIED;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      if (status.textContent === S_COPIED) clearSendStatus();
    }, 5000);
  };
  const fallback = () => {
    const field = document.getElementById('sendLink');
    let done = false;
    try {
      field.select();
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    if (done) ok();
    else {
      status.className = 'import-status err';
      status.textContent = S_COPY_FAIL;
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).then(ok, fallback);
  } else {
    fallback();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sendLink').value = parentLink();
  // «גרור/י» only where there is a mouse to drag with
  const hint = document.getElementById('importDropHint');
  if (hint && window.matchMedia && !window.matchMedia('(pointer: fine)').matches) {
    hint.textContent = 'העלה/י את קובץ ה-PDF שקיבלת מההורים.';
  }
  document.getElementById('sendCopy').addEventListener('click', copyParentLink);
});

document.addEventListener('DOMContentLoaded', () => {
  const importCodeBtn = document.getElementById('importCodeBtn');
  const importFile = document.getElementById('importFile');
  const importCancel = document.getElementById('importCancel');
  const importApply = document.getElementById('importApply');

  importCodeBtn.addEventListener('click', () => {
    importParentAnswers(document.getElementById('importCode').value);
  });

  // Pasting goes straight to the preview — no need to press the check button.
  const importCode = document.getElementById('importCode');
  importCode.addEventListener('paste', () => {
    setTimeout(() => importParentAnswers(importCode.value), 0);
  });
  // Typing over the box makes an earlier preview stale: hide it.
  importCode.addEventListener('input', () => {
    if (importPreviewData || !document.getElementById('importPreview').hidden) {
      clearImportPanel();
      importPreviewData = null;
    }
  });

  document.getElementById('importFileLabel').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = '';
    importFromFile(file);
  });

  // Drag-and-drop: a .txt dropped anywhere on the box takes the same path as
  // the file input.
  const importBox = document.getElementById('importBox');
  importBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    importBox.classList.add('drag-over');
  });
  importBox.addEventListener('dragleave', (e) => {
    if (!importBox.contains(e.relatedTarget)) importBox.classList.remove('drag-over');
  });
  importBox.addEventListener('drop', (e) => {
    e.preventDefault();
    importBox.classList.remove('drag-over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    importFromFile(file);
  });

  importCancel.addEventListener('click', () => {
    clearImportPanel();
    importPreviewData = null;
  });

  importApply.addEventListener('click', applyImportedAnswers);
  document.getElementById('importAnon').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyImportedAnswers();
    }
  });

  document.getElementById('foldToggle').addEventListener('click', () => {
    setFold(!document.getElementById('questionnaire').hidden);
  });
  document.getElementById('restoreShow').addEventListener('click', calculate);
});

// O9: a refresh opens at the top, never wherever the browser remembers.
try {
  window.history.scrollRestoration = 'manual';
} catch {
  // not supported: harmless
}
window.addEventListener('load', () => window.scrollTo(0, 0));
