/* exported EFORTSPdf */
// Builds the parent's answers PDF (loaded by parent.html after items.js,
// eforts-code.js and the vendored jsPDF).
//
// What the file is: the parent's answers as a plain file the parent can send
// to ANY therapist by ANY channel (any app, any email). The practitioner app
// reads it back through the machine line (the full EFORTS1 code as REAL PDF
// text, one line) — see app.js importFromFile().
//
// The Hebrew part is drawn on a <canvas> (the browser does the RTL/bidi work,
// jsPDF has no Hebrew font) and placed as a PNG. The questionnaire wording is
// NOT in the file: the item texts belong to the authors, so the file carries
// item numbers and the chosen answer labels only. No child name anywhere.

const EFORTSPdf = (() => {
  const PAGE_W = 1240; // A4 at ~150 dpi
  const PAGE_H = 1754;
  const MARGIN = 90;
  const CONTENT_BOTTOM = 1540; // below this: footer + code label zone
  const MM_W = 210;
  const MM_H = 297;

  const P_TITLE = 'שאלון EFORTS — תשובות ההורים';
  const P_FILL = 'תאריך מילוי: ';
  const P_SEX = 'מין: ';
  const P_SEX_M = 'בן';
  const P_SEX_F = 'בת';
  const P_DOB = 'תאריך לידה: ';
  const P_ITEM = 'פריט ';
  const P_FOOTER =
    'לשימוש המטפל/ת: יש להעלות קובץ זה לאפליקציית EFORTS, בתיבה "העלאת הקובץ שההורים החזירו".';
  const P_WITH = 'מי נמצא עם הילד בדרך כלל:';
  const P_WITH_F = 'מי נמצא עם הילדה בדרך כלל:';
  const P_WITH_NONE = 'לא סומן';
  const P_CODE_LABEL = 'שורת הקוד (אם ההעלאה לא עובדת, אפשר להעתיק ולהדביק אותה):';

  function fmtDate(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function companionLabel(value) {
    const opt = COMPANION.options.find((o) => o.value === value);
    return opt ? opt.label : P_WITH_NONE;
  }

  // The lines of the Hebrew body, in order. kind: title | line | heading | item
  function bodyLines(model) {
    const lines = [
      { kind: 'title', text: P_TITLE },
      { kind: 'line', text: P_FILL + fmtDate(model.date) },
      { kind: 'line', text: P_SEX + (model.sex === 'male' ? P_SEX_M : P_SEX_F) },
      { kind: 'line', text: P_DOB + fmtDate(model.dob) },
    ];
    lines.push({ kind: 'line', text: model.sex === 'male' ? P_WITH : P_WITH_F });
    SECTIONS.forEach((s) => {
      lines.push({ kind: 'line', text: `${s.title}: ${companionLabel(model.with[s.key])}` });
    });
    items.forEach((it) => {
      const v = model.answers[it.num - 1];
      const label = SCALE_LABELS[v - 1].replace(/\s+/g, ' ');
      lines.push({ kind: 'item', text: `${P_ITEM}${it.num}: ${label} (${v})` });
    });
    return lines;
  }

  const STYLE = {
    title: { size: 34, bold: true, gap: 18 },
    line: { size: 23, bold: false, gap: 5 },
    heading: { size: 26, bold: true, gap: 6, before: 18 },
    item: { size: 23, bold: false, gap: 2 },
  };

  function newCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    // alpha:false keeps the PNG opaque (RGB), so jsPDF can embed it cheaply
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#000000';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    return { canvas, ctx };
  }

  function setFont(ctx, family, size, bold) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${family}`;
  }

  // Greedy word wrap on logical order; each line is drawn RTL on its own.
  function wrap(ctx, text, maxWidth) {
    const words = text.split(' ');
    const out = [];
    let cur = '';
    words.forEach((w) => {
      const next = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(next).width > maxWidth) {
        out.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    });
    if (cur) out.push(cur);
    return out;
  }

  // Draws the lines onto as many canvases as needed (one if it fits).
  function paint(lines, family) {
    const pages = [newCanvas()];
    let y = MARGIN;
    const right = PAGE_W - MARGIN;
    const maxW = PAGE_W - 2 * MARGIN;
    // the items go in two columns after the head lines: right 1-15, left 16-30
    const head = lines.filter((ln) => ln.kind !== 'item');
    const cells = lines.filter((ln) => ln.kind === 'item');
    head.forEach((ln) => {
      const st = STYLE[ln.kind];
      let cur = pages[pages.length - 1];
      setFont(cur.ctx, family, st.size, st.bold);
      const parts = wrap(cur.ctx, ln.text, maxW);
      const lineH = Math.round(st.size * 1.15);
      const need = (st.before || 0) + parts.length * lineH + st.gap;
      if (y + need > CONTENT_BOTTOM && y > MARGIN) {
        pages.push(newCanvas());
        cur = pages[pages.length - 1];
        y = MARGIN;
        setFont(cur.ctx, family, st.size, st.bold);
      }
      y += st.before || 0;
      parts.forEach((p) => {
        cur.ctx.fillText(p, right, y);
        y += lineH;
      });
      y += st.gap;
    });

    const colW = Math.floor(maxW / 2);
    const rows = Math.ceil(cells.length / 2);
    const ist = STYLE.item;
    const rowH = Math.round(ist.size * 1.15) + 6;
    y += 14;
    for (let r = 0; r < rows; r++) {
      let cur = pages[pages.length - 1];
      if (y + rowH > CONTENT_BOTTOM && y > MARGIN) {
        pages.push(newCanvas());
        cur = pages[pages.length - 1];
        y = MARGIN;
      }
      setFont(cur.ctx, family, ist.size, false);
      [cells[r], cells[r + rows]].forEach((c, col) => {
        if (c) cur.ctx.fillText(c.text, right - col * colW, y);
      });
      y += rowH;
    }

    // footer + code label sit in the reserved zone of the last page
    const last = pages[pages.length - 1];
    setFont(last.ctx, family, 22, false);
    const foot = wrap(last.ctx, P_FOOTER, maxW);
    let fy = CONTENT_BOTTOM + 14;
    foot.forEach((p) => {
      last.ctx.fillText(p, right, fy);
      fy += 30;
    });
    setFont(last.ctx, family, 20, false);
    const labelLines = wrap(last.ctx, P_CODE_LABEL, maxW);
    // the real-text code line sits at MM_H - 12 mm; the label ends just above it
    const codeLineY = Math.round(((MM_H - 12) / MM_H) * PAGE_H);
    // text is drawn from its TOP: leave room for the code line's height
    let ly = Math.max(fy + 8, codeLineY - 66 - (labelLines.length - 1) * 28);
    labelLines.forEach((p) => {
      last.ctx.fillText(p, right, ly);
      ly += 28;
    });
    return pages.map((p) => p.canvas);
  }

  // Resolves to { file, pngs } — pngs are the page images (data URLs).
  async function build(code, model) {
    const { jsPDF } = window.jspdf;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const family = window.getComputedStyle(document.body).fontFamily || 'Arial, sans-serif';
    const canvases = paint(bodyLines(model), family);
    const pngs = canvases.map((c) => c.toDataURL('image/png'));

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: false });
    pngs.forEach((png, i) => {
      if (i > 0) doc.addPage();
      // 'FAST' deflates the page image only; the text (the code) stays plain
      doc.addImage(png, 'PNG', 0, 0, MM_W, MM_H, undefined, 'FAST');
    });

    // machine line: the whole code as ONE real text run on the last page
    doc.setFont('helvetica', 'normal');
    const maxWidth = MM_W - 2 * 15;
    let size = 7;
    doc.setFontSize(size);
    while (size > 5 && doc.getTextWidth(code) > maxWidth) {
      size -= 0.25;
      doc.setFontSize(size);
    }
    doc.text(code, 15, MM_H - 12);

    doc.setProperties({ title: 'EFORTS parent answers', subject: code, keywords: code });

    const blob = doc.output('blob');
    const now = new Date();
    const stamp =
      String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    const file = new window.File([blob], `EFORTS-answers-${model.date}-${stamp}.pdf`, {
      type: 'application/pdf',
    });
    return { file, pngs };
  }

  return { build, bodyLines };
})();
