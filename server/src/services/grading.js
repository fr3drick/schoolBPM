/**
 * The grading scale.
 *
 * Fixed in code for now. Making it configurable per school is a real
 * requirement eventually — schools differ, and a few use letter bands that do
 * not map onto this one at all — but guessing at the shape of that
 * configuration before a second school has asked for it would bake in the
 * wrong model. Grades are stored on the result when it is entered, so
 * introducing per-school scales later cannot restate grades already issued.
 */
export const GRADE_SCALE = [
  { min: 70, grade: 'A', remark: 'Excellent' },
  { min: 60, grade: 'B', remark: 'Very good' },
  { min: 50, grade: 'C', remark: 'Good' },
  { min: 45, grade: 'D', remark: 'Pass' },
  { min: 40, grade: 'E', remark: 'Weak pass' },
  { min: 0, grade: 'F', remark: 'Fail' },
];

/** The pass mark, used for the "subjects passed" line on a result sheet. */
export const PASS_MARK = 40;

/**
 * Grades a score out of `maxScore`.
 *
 * The bands are percentages, so a subject marked out of 40 grades on the same
 * scale as one marked out of 100 rather than failing everyone.
 */
export function gradeFor(score, maxScore = 100) {
  const max = Number(maxScore) > 0 ? Number(maxScore) : 100;
  const pct = (Number(score) / max) * 100;
  const band = GRADE_SCALE.find((b) => pct >= b.min) || GRADE_SCALE[GRADE_SCALE.length - 1];
  return { grade: band.grade, remark: band.remark, percentage: Math.round(pct * 10) / 10 };
}

/**
 * Summarises one student's results: total, average percentage and how many
 * subjects they passed.
 */
export function summarise(rows) {
  const scored = rows.filter((r) => typeof r.score === 'number');
  if (!scored.length) return { total: 0, average: 0, passed: 0, count: 0 };

  const total = scored.reduce((sum, r) => sum + r.score, 0);
  const pctSum = scored.reduce((sum, r) => sum + (r.score / (r.maxScore || 100)) * 100, 0);
  const passed = scored.filter((r) => (r.score / (r.maxScore || 100)) * 100 >= PASS_MARK).length;

  return {
    total,
    average: Math.round((pctSum / scored.length) * 10) / 10,
    passed,
    count: scored.length,
  };
}

/**
 * Positions students by average, sharing a position on a tie.
 *
 * Standard competition ranking: two students tied at the top are both 1st and
 * the next is 3rd. Anything else would tell a parent their child came second
 * when nobody actually beat them.
 */
export function positions(summaries) {
  const sorted = [...summaries].sort((a, b) => b.average - a.average);
  const byStudent = new Map();
  let position = 0;
  let previous = null;

  sorted.forEach((s, i) => {
    if (previous === null || s.average !== previous) position = i + 1;
    previous = s.average;
    byStudent.set(String(s.student), position);
  });

  return byStudent;
}
