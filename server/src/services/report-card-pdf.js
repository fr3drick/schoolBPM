import PDFDocument from 'pdfkit';
import Result from '../models/Result.js';
import Student from '../models/Student.js';
import { summarise, positions, PASS_MARK } from './grading.js';

/**
 * A termly report card: the result sheet plus attendance and a class average
 * to read the pupil's own average against.
 *
 * Distinct from result-pdf.js on purpose. The result sheet is the raw record
 * of one exam, produced as soon as marks are in; the report card is the
 * document a school issues to a family at the end of term, and carries the
 * context — attendance, class average, a signature line — that makes it one.
 */

const INK = '#212b36';
const MUTED = '#637381';
const RULE = '#d7dee6';
const BRAND = '#1565c0';
const OK = '#2e7d32';
const BAD = '#c62828';

const TIME_ZONE = resolveTimeZone(process.env.APP_TIMEZONE || 'Africa/Lagos');

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
        day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE,
      })
    : '—';

function sectionHeading(doc, text) {
  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
    .text(text.toUpperCase(), { characterSpacing: 0.8 });
  doc.moveDown(0.25);
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .lineWidth(0.5).strokeColor(RULE).stroke();
  doc.moveDown(0.6);
}

export async function buildReportCard({ exam, student, school, attendance }) {
  const maxBySubject = new Map(exam.subjects.map((s) => [String(s.subject._id || s.subject), s.maxScore]));

  const rows = (await Result.find({ exam: exam._id, student: student._id }).populate('subject', 'name code'))
    .map((r) => ({
      subject: r.subject?.name || '',
      score: r.score,
      grade: r.grade,
      remark: r.remark,
      maxScore: maxBySubject.get(String(r.subject?._id || r.subject)) || 100,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const summary = summarise(rows);

  // The class context: position, and the average to read this pupil against.
  const classmates = await Student.find({
    school: exam.school, class: exam.class._id, status: 'active',
  }).select('_id');
  const all = await Result.find({ exam: exam._id }).select('student score subject');
  const byStudent = new Map();
  for (const r of all) {
    const key = String(r.student);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push({ score: r.score, maxScore: maxBySubject.get(String(r.subject)) || 100 });
  }
  const summaries = classmates
    .map((c) => ({ student: c._id, ...summarise(byStudent.get(String(c._id)) || []) }))
    .filter((s) => s.count > 0);
  const position = positions(summaries).get(String(student._id)) || null;
  const classAverage = summaries.length
    ? Math.round((summaries.reduce((sum, s) => sum + s.average, 0) / summaries.length) * 10) / 10
    : 0;

  return draw({
    exam, student, school, rows, summary, position,
    classSize: summaries.length, classAverage, attendance,
  });
}

function draw({ exam, student, school, rows, summary, position, classSize, classAverage, attendance }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));

  const termName = exam.term ? `${exam.term[0].toUpperCase()}${exam.term.slice(1)} term` : '';

  // ---- header ----
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND)
    .text((school?.name || 'School').toUpperCase(), { characterSpacing: 1 });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text('Report card');
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(`${termName} · ${exam.session}`);

  doc.moveDown(0.9);
  const infoY = doc.y;
  const half = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
  const pair = (label, value, x, y) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label.toUpperCase(), x, y, { characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
      .text(value, x, y + 12, { width: half - 10 });
  };
  pair('Pupil', [student.firstName, student.otherNames, student.lastName].filter(Boolean).join(' '),
    doc.page.margins.left, infoY);
  pair('Class', exam.class?.name || '—', doc.page.margins.left + half, infoY);
  doc.y = infoY + 34;
  const admY = doc.y;
  pair('Admission number', student.admissionNumber, doc.page.margins.left, admY);
  pair('Issued', fmtDate(new Date()), doc.page.margins.left + half, admY);
  doc.y = admY + 34;

  // ---- subjects ----
  sectionHeading(doc, 'Subjects');
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const cols = {
    subject: left, score: left + width * 0.50, grade: left + width * 0.68, remark: left + width * 0.80,
  };

  doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED);
  const hY = doc.y;
  doc.text('SUBJECT', cols.subject, hY);
  doc.text('SCORE', cols.score, hY, { width: width * 0.15, align: 'right' });
  doc.text('GRADE', cols.grade, hY, { width: width * 0.10, align: 'center' });
  doc.text('REMARK', cols.remark, hY);
  doc.y = hY;
  doc.moveDown(1.1);

  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED)
      .text('No results were recorded this term.', left);
  }

  for (const row of rows) {
    const y = doc.y;
    const pct = (row.score / row.maxScore) * 100;
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(row.subject, cols.subject, y, { width: width * 0.48 });
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(`${row.score} / ${row.maxScore}`, cols.score, y, { width: width * 0.15, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(pct >= PASS_MARK ? OK : BAD)
      .text(row.grade, cols.grade, y, { width: width * 0.10, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(row.remark || '', cols.remark, y, { width: width * 0.20 });
    doc.y = y;
    doc.moveDown(1.1);
  }

  // ---- summary ----
  sectionHeading(doc, 'Summary');
  const sy = doc.y;
  const box = width / 4;
  const stat = (label, value, x, colour = INK) => {
    doc.font('Helvetica-Bold').fontSize(15).fillColor(colour).text(String(value), x, sy, { width: box - 8 });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(label.toUpperCase(), x, sy + 19, { width: box - 8, characterSpacing: 0.4 });
  };
  stat('Average', `${summary.average}%`, left, summary.average >= classAverage ? OK : INK);
  stat('Class average', `${classAverage}%`, left + box);
  stat('Position', position ? `${position} of ${classSize}` : '—', left + box * 2);
  stat(
    'Attendance',
    attendance?.sessions ? `${Math.round((attendance.attended / attendance.sessions) * 1000) / 10}%` : '—',
    left + box * 3
  );
  doc.y = sy + 40;

  if (attendance?.sessions) {
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(`Present for ${attendance.attended} of ${attendance.sessions} sessions recorded this term.`, left);
  }

  // ---- signature ----
  sectionHeading(doc, "Head of school");
  const gy = doc.y + 26;
  doc.moveTo(left, gy).lineTo(left + width * 0.42, gy).lineWidth(0.5).strokeColor(RULE).stroke();
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('Signature and date', left, gy + 6);

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
        `${student.admissionNumber} · ${termName} ${exam.session} report card · page ${i - range.start + 1} of ${range.count}`,
        doc.page.margins.left, y + 8,
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
