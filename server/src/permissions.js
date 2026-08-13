export const PERMISSIONS = [
  { key: 'users.manage', label: 'Manage users', group: 'Administration' },
  { key: 'roles.manage', label: 'Manage roles & permissions', group: 'Administration' },
  { key: 'audit.view', label: 'View audit log', group: 'Administration' },
  { key: 'definitions.manage', label: 'Design processes', group: 'Processes' },
  { key: 'instances.initiate', label: 'Start requests', group: 'Requests' },
  { key: 'instances.act', label: 'Act on assigned approval steps', group: 'Requests' },
  { key: 'instances.view_all', label: 'View all requests', group: 'Requests' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
