import { Router } from 'express';
import ProcessInstance from '../models/ProcessInstance.js';
import Student from '../models/Student.js';
import Exam from '../models/Exam.js';
import Class from '../models/Class.js';
import Attendance from '../models/Attendance.js';
import { requireAuth, requireSchool, hasPerm, hasModule } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireSchool);

/** Midnight local time, matching how a register's date is stored. */
function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Workflow figures. Every school used to get these whether or not it had the
 * workflow module, which is why a school running only students+exams saw a
 * dashboard of four zeroes.
 */
async function workflowSection(me, school) {
  const myOpen = await ProcessInstance.countDocuments({
    school,
    initiator: me._id,
    status: { $in: ['in_progress', 'returned'] },
  });

  let myTasks = 0;
  if (hasPerm(me, 'instances.act')) {
    myTasks = await ProcessInstance.countDocuments({
      school,
      status: 'in_progress',
      currentApproverRoles: me.role._id,
      initiator: { $ne: me._id },
    });
  }

  let totals = null;
  if (hasPerm(me, 'instances.view_all')) {
    const agg = await ProcessInstance.aggregate([
      { $match: { school } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    totals = { in_progress: 0, approved: 0, rejected: 0, returned: 0 };
    for (const a of agg) totals[a._id] = a.count;
  }

  const recentMine = await ProcessInstance.find({ school, initiator: me._id })
    .sort({ updatedAt: -1 })
    .limit(5);

  return { myOpen, myTasks, totals, recentMine };
}

/**
 * `missingGuardian` is the actionable one: a student with no guardian email
 * cannot be sent a report card, and the failure surfaces at publish time when
 * it is too late to fix quietly.
 */
async function studentsSection(school) {
  const [active, missingGuardian] = await Promise.all([
    Student.countDocuments({ school, status: 'active' }),
    Student.countDocuments({
      school,
      status: 'active',
      guardians: { $not: { $elemMatch: { email: { $exists: true, $nin: [null, ''] } } } },
    }),
  ]);
  return { active, missingGuardian };
}

async function examsSection(school) {
  const [open, draft, published] = await Promise.all([
    Exam.countDocuments({ school, status: 'open' }),
    Exam.countDocuments({ school, status: 'draft' }),
    Exam.countDocuments({ school, status: 'published' }),
  ]);
  return { open, draft, published };
}

/**
 * Classes whose register has not been taken today — the one attendance number
 * that tells someone to go and do something.
 */
async function attendanceSection(school) {
  const [classCount, takenToday] = await Promise.all([
    Class.countDocuments({ school }),
    Attendance.countDocuments({ school, date: today() }),
  ]);
  return { classCount, takenToday, missingToday: Math.max(classCount - takenToday, 0) };
}

router.get('/stats', async (req, res) => {
  const me = req.user;
  const school = me.school._id;

  // Each section is gated on the module AND a permission, and omitted entirely
  // when either is absent. The route itself is never module-gated — a school
  // must always be able to reach its own dashboard — so the gating has to
  // happen per section or the payload leaks counts from modules a school was
  // never given.
  const wants = {
    workflow:
      hasModule(me, 'workflow') &&
      (hasPerm(me, 'instances.initiate') || hasPerm(me, 'instances.act') || hasPerm(me, 'instances.view_all')),
    students: hasModule(me, 'students') && (hasPerm(me, 'students.view') || hasPerm(me, 'students.manage')),
    exams: hasModule(me, 'exams') && (hasPerm(me, 'exams.manage') || hasPerm(me, 'results.enter') || hasPerm(me, 'results.view')),
    attendance: hasModule(me, 'attendance') && (hasPerm(me, 'attendance.take') || hasPerm(me, 'attendance.view')),
  };

  const [workflow, students, exams, attendance] = await Promise.all([
    wants.workflow ? workflowSection(me, school) : null,
    wants.students ? studentsSection(school) : null,
    wants.exams ? examsSection(school) : null,
    wants.attendance ? attendanceSection(school) : null,
  ]);

  res.json({ workflow, students, exams, attendance });
});

export default router;
