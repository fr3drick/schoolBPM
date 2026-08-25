import { GENDERS, STUDENT_STATUSES } from '../models/Student.js';
import { httpError } from './errors.js';

/**
 * The CSV import columns, in the order the template presents them.
 * Exported so the client can build a matching template and the server can
 * report what it expected when a file does not match.
 */
export const IMPORT_COLUMNS = [
  'admissionNumber', 'firstName', 'lastName', 'otherNames',
  'dateOfBirth', 'gender', 'class',
  'guardianName', 'guardianRelationship', 'guardianEmail', 'guardianPhone',
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  // Accept ISO (2012-04-09) and the d/m/Y that spreadsheets export.
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : raw;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw httpError(400, `"${raw}" is not a valid date`);
  if (date > new Date()) throw httpError(400, 'Date of birth cannot be in the future');
  return date;
}

/** Columns that together make up the guardian on a spreadsheet row. */
const GUARDIAN_COLUMNS = ['guardianName', 'guardianRelationship', 'guardianEmail', 'guardianPhone'];

/**
 * Normalises and validates a student payload from either the form or a CSV row.
 *
 * Both entry points share this so a rule can never hold on one path and not
 * the other. Guardians arrive either as an array (the form) or as flat
 * guardian* columns (the spreadsheet).
 *
 * `present` is the set of columns the source actually carried, and is given
 * only by the import. Without it every field comes back filled in with a
 * default, which is right for the form (it always posts the whole student)
 * but destructive for an update from a spreadsheet: a sheet of corrected
 * phone numbers would blank out the date of birth, gender and guardians of
 * every student it touched, and report it as a success. With it, a column
 * that was not in the file is simply absent from the result and the existing
 * value survives. A column that IS present but empty still clears the field
 * — that is a deliberate erasure rather than an omission.
 */
export function cleanStudent(body, present = null) {
  const has = (key) => present === null || present.has(key);
  const admissionNumber = String(body?.admissionNumber || '').trim();
  const firstName = String(body?.firstName || '').trim();
  const lastName = String(body?.lastName || '').trim();

  if (!admissionNumber) throw httpError(400, 'Admission number is required');
  if (admissionNumber.length > 40) throw httpError(400, 'Admission number must be 40 characters or fewer');
  if (!firstName) throw httpError(400, 'First name is required');
  if (!lastName) throw httpError(400, 'Last name is required');

  const gender = String(body?.gender || '').trim().toLowerCase();
  if (gender && !GENDERS.includes(gender)) {
    throw httpError(400, `Gender must be one of: ${GENDERS.filter(Boolean).join(', ')}`);
  }

  const status = String(body?.status || 'active').trim().toLowerCase();
  if (!STUDENT_STATUSES.includes(status)) {
    throw httpError(400, `Status must be one of: ${STUDENT_STATUSES.join(', ')}`);
  }

  const guardians = Array.isArray(body?.guardians)
    ? body.guardians
    : [{
        name: body?.guardianName,
        relationship: body?.guardianRelationship,
        email: body?.guardianEmail,
        phone: body?.guardianPhone,
      }];

  const cleanGuardians = guardians
    .map((g) => ({
      name: String(g?.name || '').trim(),
      relationship: String(g?.relationship || '').trim(),
      email: String(g?.email || '').trim().toLowerCase(),
      phone: String(g?.phone || '').trim(),
      isPrimary: Boolean(g?.isPrimary),
    }))
    // A row with no guardian details at all is simply a student without one.
    .filter((g) => g.name || g.email || g.phone);

  for (const g of cleanGuardians) {
    if (!g.name) throw httpError(400, 'A guardian with contact details also needs a name');
    if (g.email && !EMAIL_RE.test(g.email)) throw httpError(400, `"${g.email}" is not a valid email address`);
  }
  // Exactly one primary, so result delivery never has to guess.
  if (cleanGuardians.length && !cleanGuardians.some((g) => g.isPrimary)) {
    cleanGuardians[0].isPrimary = true;
  }

  const data = { admissionNumber, firstName, lastName };
  if (has('otherNames')) data.otherNames = String(body?.otherNames || '').trim();
  if (has('dateOfBirth')) data.dateOfBirth = parseDate(body?.dateOfBirth);
  if (has('gender')) data.gender = gender;
  if (has('status')) data.status = status;
  if (has('notes')) data.notes = String(body?.notes || '').trim();
  // Guardians are rebuilt only when the source carried at least one of the
  // columns they are assembled from.
  if (Array.isArray(body?.guardians) || GUARDIAN_COLUMNS.some((c) => has(c))) {
    data.guardians = cleanGuardians;
  }
  return data;
}
