export interface PermissionDef {
  key: string;
  label: string;
  group: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem?: boolean;
  userCount?: number;
}

export interface SchoolRef {
  id: string;
  name: string;
  slug: string;
  active?: boolean;
}

export interface School {
  _id: string;
  name: string;
  slug: string;
  contactEmail?: string;
  active: boolean;
  userCount?: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  isPlatformAdmin?: boolean;
  createdAt?: string;
  school: SchoolRef | null;
  role: Role | null;
}

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';

export interface FieldDef {
  key?: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  placeholder?: string;
}

export interface RoleRef {
  _id: string;
  name: string;
}

export interface StepDef {
  name: string;
  approverRoles: (RoleRef | string)[];
  instructions?: string;
}

export interface ProcessDefinition {
  _id: string;
  name: string;
  key: string;
  category: string;
  description: string;
  initiatorRoles: (RoleRef | string)[];
  fields: FieldDef[];
  steps: StepDef[];
  active: boolean;
}

export interface SnapshotStep {
  name: string;
  instructions?: string;
  approverRoles: { id: string; name: string }[];
}

export interface Snapshot {
  name: string;
  key: string;
  category: string;
  description: string;
  fields: FieldDef[];
  steps: SnapshotStep[];
}

export interface HistoryEntry {
  action: 'submitted' | 'approved' | 'rejected' | 'returned' | 'resubmitted';
  byName: string;
  roleName?: string;
  stepIndex: number;
  stepName: string;
  comment: string;
  at: string;
}

export type InstanceStatus = 'in_progress' | 'approved' | 'rejected' | 'returned';

export interface ProcessInstance {
  _id: string;
  reference: string;
  definitionSnapshot: Snapshot;
  initiator: string;
  initiatorName: string;
  data: Record<string, unknown>;
  currentStep: number;
  status: InstanceStatus;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Viewer {
  canAct: boolean;
  canResubmit: boolean;
}

export interface AppNotification {
  _id: string;
  message: string;
  instance?: string;
  reference?: string;
  read: boolean;
  createdAt: string;
}

export interface DashboardStats {
  myOpen: number;
  myTasks: number;
  totals: Record<InstanceStatus, number> | null;
  recentMine: ProcessInstance[];
}

export const STATUS_LABELS: Record<InstanceStatus, string> = {
  in_progress: 'In progress',
  approved: 'Approved',
  rejected: 'Rejected',
  returned: 'Returned',
};
