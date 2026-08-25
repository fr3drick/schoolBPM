import PDFDocument from 'pdfkit';
import Result from '../models/Result.js';
import Student from '../models/Student.js';
import { summarise, positions, PASS_MARK } from './grading.js';

/**
 * Renders one student's result sheet as a one-page A4 record.
 *
 * Shares the visual language and the footer-margin workaround of
 * request-pdf.js. Kept as its own module rather than generalised into a
 * shared renderer: the two documents have almost nothing in common beyond
 * the palette, and a single parameterised renderer for both would be harder
 * to read than either.
 */

const INK = '#212b36';
const MUTED = '#637381';
const RULE = '#d7dee6';
const BRAND = '#1565c0';
const OK = '#2e7d32';
const BAD = '#c62828';

const TIME_ZONE = resolveTimeZone(process.env.APP_TIMEZONE || 'Africa/Lagos');

/** A typo in APP_TIMEZONE must not turn every download into a 500. */
function resolveTimeZone(zone) {
  try {
    new Date().toLocaleString('en-GB', { timeZone: zone });
    return zone;
  } catch {
    console.error(`Invalid APP_TIMEZONE "${zone}" — falling back to UTC for PDF dates`);
    return 'UTC';
  }
}

const fmtDate = (value) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE,
      })
    : '—';

function rule(doc) {
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(0.5).strokeColor(RULE).stroke();
  doc.moveDown(0.6);
}

function sectionHeading(doc, text) {
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
    .text(text.toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.3);
  rule(doc);
}

/**
 * Collects the sheet's data and draws it.
 *
 * Returns a Buffer rather than a stream: the caller needs the length to set
 * a header, and a result sheet is small enough that buffering it costs
 * nothing worth the extra plumbing.
 */
export async function buildResultSheet({ exam, student, school }) {
  const maxBySubject = new Map(
    exam.subjects.map((s) => [String(s.subject._id || s.subject), s.maxScore])
  );

  const rows = (await Result.find({ exam: exam._id, student: student._id })
    .populate('subject', 'name code'))
    .map((r) => ({
      subject: r.subject?.name || '',
      score: r.score,
      grade: r.grade,
      remark: r.remark,
      maxScore: maxBySubject.get(String(r.subject?._id || r.subject)) || 100,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const summary = summarise(rows);

  // Position needs the whole class, not just this student.
  const classmates = await Student.find({
    school: exam.school, class: exam.class._id, status: 'active',
  }).select('_id');
  const allResults = await Result.find({ exam: exam._id }).select('student score subject');
  const byStudent = new Map();
  for (const r of allResults) {
    const key = String(r.student);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push({ score: r.score, maxScore: maxBySubject.get(String(r.subject)) || 100 });
  }
  const summaries = classmates
    .map((c) => ({ student: c._id, ...summarise(byStudent.get(String(c._id)) || []) }))
    .filter((s) => s.count > 0);
  const position = positions(summaries).get(String(student._id)) || null;

  return draw({ exam, student, school, rows, summary, position, classSize: summaries.length });
}

function draw({ exam, student, school, rows, summary, position, classSize }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  const termName = exam.term ? `${exam.term[0].toUpperCase()}${exam.term.slice(1)} term` : '';

  // ---- header ----
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND)
    .text((school?.name || 'School').toUpperCase(), { characterSpacing: 1 });
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(19).fillColor(INK)
    .text([student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' '));
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(12).fillColor(MUTED)
    .text(`${student.admissionNumber} · ${exam.class?.name || ''}`);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text(`${termName} ${exam.session} results`);

  doc.moveDown(0.9);
  rule(doc);

  // ---- results table ----
  sectionHeading(doc, 'Subjects');

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const cols = { subject: left, score: left + width * 0.52, grade: left + width * 0.70, remark: left + width * 0.82 };

  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
  const headerY = doc.y;
  doc.text('SUBJECT', cols.subject, headerY);
  doc.text('SCORE', cols.score, headerY, { width: width * 0.14, align: 'right' });
  doc.text('GRADE', cols.grade, headerY, { width: width * 0.10, align: 'center' });
  doc.text('REMARK', cols.remark, headerY);
  doc.y = headerY;
  doc.moveDown(1);

  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED)
      .text('No results were recorded for this student.', left);
  }

  for (const row of rows) {
    const y = doc.y;
    const pct = (row.score / row.maxScore) * 100;
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(row.subject, cols.subject, y, { width: width * 0.50 });
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(`${row.score} / ${row.maxScore}`, cols.score, y, { width: width * 0.14, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(pct >= PASS_MARK ? OK : BAD)
      .text(row.grade, cols.grade, y, { width: width * 0.10, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(row.remark || '', cols.remark, y, { width: width * 0.18 });
    doc.y = y;
    doc.moveDown(1.1);
  }

  // ---- summary ----
  sectionHeading(doc, 'Summary');
  const sy = doc.y;
  const box = width / 3;
  const stat = (label, value, x) => {
    doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text(String(value), x, sy, { width: box });
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label.toUpperCase(), x, sy + 21, { width: box, characterSpacing: 0.5 });
  };
  stat('Average', `${summary.average}%`, left);
  stat('Subjects passed', `${summary.passed} of ${summary.count}`, left + box);
  if (position) stat('Position in class', `${position} of ${classSize}`, left + box * 2);
  doc.y = sy + 40;

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
        `${student.admissionNumber} · ${termName} ${exam.session} · generated ${fmtDate(new Date())} · page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left,
        y + 8,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center', lineBreak: false }
      );
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
