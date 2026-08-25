/**
 * Feature modules a school can be given.
 *
 * Same idiom as permissions.js: the catalogue lives in code, the per-school
 * state lives in data (School.modules). Adding a module means adding an entry
 * here and building the feature — never branching on a school's name.
 *
 * Modules and permissions are independent gates. A user needs the module
 * enabled for their school AND the permission on their role. Modules are the
 * platform's decision (what a school has bought); permissions are the
 * school's (who may use it).
 */
export const MODULES = [
  {
    key: 'workflow',
    name: 'Approval workflows',
    description: 'Configurable request and approval processes: leave, purchases, field trips.',
    defaultOn: true,
    permissions: ['definitions.manage', 'instances.initiate', 'instances.act', 'instances.view_all'],
  },
  {
    key: 'students',
    name: 'Students & classes',
    description: 'Student records with guardian contacts, classes and subjects.',
    defaultOn: true,
    permissions: ['students.view', 'students.manage', 'classes.manage', 'subjects.manage'],
  },
  {
    key: 'exams',
    name: 'Exams & results',
    description: 'Termly exams, result entry by teachers, and publishing results to guardians.',
    defaultOn: false,
    // Results are recorded against students in a class; without that module
    // there is nothing to attach them to.
    requires: ['students'],
    permissions: ['exams.manage', 'results.enter', 'results.view'],
  },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);
export const DEFAULT_MODULES = MODULES.filter((m) => m.defaultOn).map((m) => m.key);

export function getModule(key) {
  return MODULES.find((m) => m.key === key) || null;
}

/** Permission keys belonging to a module, for filtering the roles UI. */
export function permissionsForModules(enabled) {
  const set = new Set(enabled || []);
  return MODULES.filter((m) => set.has(m.key)).flatMap((m) => m.permissions);
}

/**
 * Validates a requested set of module keys.
 * Returns { modules } on success or { error } describing the first problem.
 */
export function validateModuleSelection(requested) {
  if (!Array.isArray(requested)) return { error: 'modules must be an array' };

  const unknown = requested.filter((k) => !MODULE_KEYS.includes(k));
  if (unknown.length) return { error: `Unknown modules: ${unknown.join(', ')}` };

  const chosen = [...new Set(requested)];
  for (const key of chosen) {
    const mod = getModule(key);
    const missing = (mod.requires || []).filter((dep) => !chosen.includes(dep));
    if (missing.length) {
      const names = missing.map((d) => getModule(d)?.name || d).join(', ');
      return { error: `"${mod.name}" also needs ${names} enabled.` };
    }
  }
  // Catalogue order, so the stored array reads predictably.
  return { modules: MODULE_KEYS.filter((k) => chosen.includes(k)) };
}
