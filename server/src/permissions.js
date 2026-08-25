// `module` ties a permission to a feature module. Permissions without one are
// always available: a school must be able to administer itself no matter which
// modules it has. The roles UI hides permissions whose module is switched off.
export const PERMISSIONS = [
  { key: 'users.manage', label: 'Manage users', group: 'Administration' },
  { key: 'roles.manage', label: 'Manage roles & permissions', group: 'Administration' },
  { key: 'audit.view', label: 'View audit log', group: 'Administration' },
  { key: 'email.view', label: 'View email delivery', group: 'Administration' },
  { key: 'definitions.manage', label: 'Design processes', group: 'Processes', module: 'workflow' },
  { key: 'instances.initiate', label: 'Start requests', group: 'Requests', module: 'workflow' },
  { key: 'instances.act', label: 'Act on assigned approval steps', group: 'Requests', module: 'workflow' },
  { key: 'instances.view_all', label: 'View all requests', group: 'Requests', module: 'workflow' },
  { key: 'students.view', label: 'View students', group: 'Students', module: 'students' },
  { key: 'students.manage', label: 'Add and edit students', group: 'Students', module: 'students' },
  { key: 'classes.manage', label: 'Manage classes', group: 'Students', module: 'students' },
  { key: 'subjects.manage', label: 'Manage subjects', group: 'Students', module: 'students' },
  { key: 'exams.manage', label: 'Create and publish exams', group: 'Exams', module: 'exams' },
  { key: 'results.enter', label: 'Enter exam results', group: 'Exams', module: 'exams' },
  { key: 'results.view', label: 'View exam results', group: 'Exams', module: 'exams' },
  { key: 'attendance.take', label: 'Take the class register', group: 'Attendance', module: 'attendance' },
  { key: 'attendance.view', label: 'View attendance records', group: 'Attendance', module: 'attendance' },
  { key: 'reports.issue', label: 'Issue report cards', group: 'Report cards', module: 'reports' },
  { key: 'reports.view', label: 'View report cards', group: 'Report cards', module: 'reports' },
  { key: 'comms.send', label: 'Send announcements', group: 'Communications', module: 'communications' },
  { key: 'comms.view', label: 'View sent announcements', group: 'Communications', module: 'communications' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
