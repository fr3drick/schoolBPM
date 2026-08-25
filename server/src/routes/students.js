import { Router } from 'express';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import { requireAuth, requireSchool, requireModule, permit } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';
import { httpError } from '../services/errors.js';
import { cleanStudent, IMPORT_COLUMNS } from '../services/students.js';
import { CI } from '../models/collation.js';

const router = Router();
router.use(requireAuth, requireSchool, requireModule('students'));

router.get('/', permit('students.view', 'students.manage'), async (req, res) => {
  const filter = { school: req.user.school._id };
  if (req.query.class) filter.class = req.query.class;
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) {
    const q = String(req.query.q).trim().slice(0, 60);
    // Escaped: a search box must not let a user inject a regex.
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { admissionNumber: rx }];
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const skip = Math.max(Number(req.query.skip) || 0, 0);

  const [students, total] = await Promise.all([
    Student.find(filter).populate('class', 'name').sort({ lastName: 1, firstName: 1 }).skip(skip).limit(limit),
    Student.countDocuments(filter),
  ]);
  res.json({ students, total });
});

router.get('/:id', permit('students.view', 'students.manage'), async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, school: req.user.school._id })
    .populate('class', 'name');
  if (!student) throw httpError(404, 'Student not found');
  res.json({ student });
});

/** Class ids arriving from a client must belong to the caller's school. */
async function resolveClass(classId, schoolId) {
  if (!classId) return null;
  const klass = await Class.findOne({ _id: classId, school: schoolId });
  if (!klass) throw httpError(400, 'Class not found in this school');
  return klass._id;
}

router.post('/', permit('students.manage'), async (req, res) => {
  const data = cleanStudent(req.body);
  data.class = await resolveClass(req.body?.class, req.user.school._id);
  const student = await Student.create({ ...data, school: req.user.school._id });
  logAudit(req.user, 'students.create', 'student', student._id,
    { admissionNumber: student.admissionNumber, name: student.fullName });
  res.status(201).json({ student });
});

router.put('/:id', permit('students.manage'), async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!student) throw httpError(404, 'Student not found');
  const data = cleanStudent(req.body);
  data.class = await resolveClass(req.body?.class, req.user.school._id);
  Object.assign(student, data);
  await student.save();
  logAudit(req.user, 'students.update', 'student', student._id,
    { admissionNumber: student.admissionNumber });
  res.json({ student });
});

router.delete('/:id', permit('students.manage'), async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, school: req.user.school._id });
  if (!student) throw httpError(404, 'Student not found');
  await student.deleteOne();
  logAudit(req.user, 'students.delete', 'student', student._id,
    { admissionNumber: student.admissionNumber });
  res.json({ ok: true });
});

/**
 * Bulk import.
 *
 * The CSV is parsed in the browser and arrives as JSON, so there is no upload
 * surface here — but every row is validated again regardless, because the
 * client is never the authority on what is valid.
 *
 * Rows are processed independently and failures are reported per row rather
 * than aborting the batch: an admin importing 400 students should not lose
 * 399 good rows to one bad date.
 */
router.post('/import', permit('students.manage'), async (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows)) throw httpError(400, 'rows must be an array');
  if (rows.length === 0) throw httpError(400, 'Nothing to import');
  if (rows.length > 2000) throw httpError(400, 'Import is limited to 2000 rows at a time');

  const updateExisting = Boolean(req.body?.updateExisting);

  // Class names are resolved once, not per row.
  const classes = await Class.find({ school: req.user.school._id }).select('name');
  const byName = new Map(classes.map((c) => [c.name.toLowerCase(), c._id]));

  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i += 1) {
    // Row 1 is the header in the user's spreadsheet, so data starts at 2.
    const rowNumber = i + 2;
    try {
      // Only the columns this row actually carried, so an update touches
      // nothing the spreadsheet did not mention.
      const present = new Set(Object.keys(rows[i] || {}));
      const data = cleanStudent(rows[i], present);
      if (present.has('class')) {
        const className = String(rows[i]?.class || '').trim();
        if (className) {
          const id = byName.get(className.toLowerCase());
          if (!id) throw httpError(400, `Class "${className}" does not exist`);
          data.class = id;
        } else {
          // The column is there and empty: an explicit unassign.
          data.class = null;
        }
      }

      // Same collation as the unique index, or a sheet that types "csv001"
      // for an existing "CSV001" would miss here and then collide on write.
      const existing = await Student.findOne({
        school: req.user.school._id,
        admissionNumber: data.admissionNumber,
      }).collation(CI);

      if (existing) {
        if (!updateExisting) {
          results.skipped += 1;
          results.errors.push({ row: rowNumber, message: `Admission number ${data.admissionNumber} already exists` });
          continue;
        }
        Object.assign(existing, data);
        await existing.save();
        results.updated += 1;
      } else {
        await Student.create({ ...data, school: req.user.school._id });
        results.created += 1;
      }
    } catch (err) {
      results.skipped += 1;
      results.errors.push({ row: rowNumber, message: err.message || 'Invalid row' });
    }
  }

  logAudit(req.user, 'students.import', 'student', null, {
    created: results.created, updated: results.updated, skipped: results.skipped,
  });
  res.json({ ...results, columns: IMPORT_COLUMNS });
});

export default router;
