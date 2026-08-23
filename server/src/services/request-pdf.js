import PDFDocument from 'pdfkit';

/**
 * Renders an approved request as a one-page A4 record.
 *
 * Everything is read from the instance's definitionSnapshot, not the live
 * definition, so a request approved two years ago still prints with the
 * labels and approval chain it was actually approved under.
 */

const INK = '#212b36';
const MUTED = '#637381';
const RULE = '#d7dee6';
const BRAND = '#1565c0';
const OK = '#2e7d32';

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
    : '—';

function displayValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function rule(doc) {
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(0.5).strokeColor(RULE).stroke();
}

function sectionHeading(doc, text) {
  doc.moveDown(1)
    .font('Helvetica-Bold').fontSize(9).fillColor(MUTED)
    .text(text.toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.3);
  rule(doc);
  doc.moveDown(0.6);
}

/** Label/value row that keeps the value column aligned and wrapping. */
function field(doc, label, value) {
  const left = doc.page.margins.left;
  const labelWidth = 150;
  const valueWidth = doc.page.width - doc.page.margins.right - left - labelWidth;
  const y = doc.y;

  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
    .text(label, left, y, { width: labelWidth - 10 });
  const labelBottom = doc.y;

  doc.font('Helvetica').fontSize(10).fillColor(INK)
    .text(displayValue(value), left + labelWidth, y, { width: valueWidth });

  doc.y = Math.max(labelBottom, doc.y) + 6;
}

/**
 * @param {object} instance  a ProcessInstance document
 * @param {string} schoolName
 * @param {object} exportedBy  the user requesting the download
 * @returns {PDFDocument} a readable stream, already ended
 */
export function buildRequestPdf(instance, schoolName, exportedBy) {
  const snap = instance.definitionSnapshot || {};
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

  // ---- header ----
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND)
    .text((schoolName || 'School BPM').toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(19).fillColor(INK).text(snap.name || 'Request');
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(12).fillColor(MUTED).text(instance.reference || '');

  // Status pill, right-aligned against the title.
  const pillLabel = instance.status === 'approved' ? 'APPROVED' : String(instance.status || '').toUpperCase();
  const pillWidth = doc.widthOfString(pillLabel) + 24;
  const pillX = doc.page.width - doc.page.margins.right - pillWidth;
  doc.roundedRect(pillX, 62, pillWidth, 20, 10).fillColor('#e8f5e9').fill();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(OK)
    .text(pillLabel, pillX, 68, { width: pillWidth, align: 'center' });

  doc.moveDown(1);
  doc.y = Math.max(doc.y, 100);
  rule(doc);

  // ---- summary ----
  doc.moveDown(0.8);
  field(doc, 'Requested by', instance.initiatorName);
  field(doc, 'Submitted', fmtDate(instance.createdAt));
  field(doc, 'Completed', fmtDate(instance.updatedAt));

  // ---- submitted details ----
  sectionHeading(doc, 'Request details');
  const fields = snap.fields || [];
  if (fields.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text('No form fields.');
  } else {
    for (const f of fields) field(doc, f.label, instance.data?.[f.key]);
  }

  // ---- approvals ----
  sectionHeading(doc, 'Approval chain');
  const decisions = (instance.history || []).filter((h) => h.action === 'approved');
  (snap.steps || []).forEach((step, i) => {
    const decision = decisions.find((d) => d.stepIndex === i);
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.right - left;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
      .text(`${i + 1}. ${step.name}`, left, doc.y, { width, continued: false });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(
        decision
          ? `Approved by ${decision.byName}${decision.roleName ? ` (${decision.roleName})` : ''} · ${fmtDate(decision.at)}`
          : 'No recorded decision',
        left + 14,
        doc.y,
        { width: width - 14 }
      );
    if (decision?.comment) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK)
        .text(`“${decision.comment}”`, left + 14, doc.y + 2, { width: width - 14 });
    }
    doc.moveDown(0.7);
  });

  // ---- footer on every page ----
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Writing inside the bottom margin makes PDFKit auto-append a blank
    // page. Drop the margin for the footer, then restore it.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 60;
    doc.moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .lineWidth(0.5).strokeColor(RULE).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(
        `${instance.reference} · generated ${fmtDate(new Date())} by ${exportedBy?.name || 'unknown'} · page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left,
        y + 8,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center', lineBreak: false }
      );
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  return doc;
}
