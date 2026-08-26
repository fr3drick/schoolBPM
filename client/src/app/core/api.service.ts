import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  Announcement,
  AppNotification,
  AttendanceSummaryRow,
  Audience,
  DashboardStats,
  Exam,
  ExamStatus,
  PublishOutcome,
  Register,
  ReportCardRow,
  ResultRow,
  TeacherDirectory,
  PermissionDef,
  ProcessDefinition,
  ProcessInstance,
  EmailCounts,
  EmailDelivery,
  ImportResult,
  ModuleDef,
  Role,
  School,
  SchoolClass,
  Student,
  Subject,
  SchoolRegistration,
  UserProfile,
  Viewer,
} from './models';

/** Offset paging, as every paginated endpoint on this API takes it. */
export interface Page {
  skip?: number;
  limit?: number;
}

/**
 * Drops empty strings but keeps zeroes — `skip: 0` is a real page and must not
 * be filtered out the way `class: ''` is.
 */
function queryParams(params: Record<string, string | number | undefined | null>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    query[k] = String(v);
  }
  return query;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // ---- auth ----
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<{ ok: boolean; token?: string }>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }
  forgotPassword(email: string) {
    return this.http.post<{ ok: boolean; message: string }>('/api/auth/forgot-password', { email });
  }
  checkResetToken(token: string) {
    return this.http.get<{ valid: boolean; ttlMinutes: number }>(
      `/api/auth/reset-password/${encodeURIComponent(token)}`
    );
  }
  completePasswordReset(token: string, newPassword: string) {
    return this.http.post<{ ok: boolean }>('/api/auth/reset-password', { token, newPassword });
  }

  // ---- self-onboarding (public, no token) ----
  startSignup(body: { name: string; email: string; password: string }) {
    return this.http.post<{ ok: boolean; email: string; ttlMinutes: number; message: string }>(
      '/api/signup',
      body
    );
  }
  resendSignupCode(email: string) {
    return this.http.post<{ ok: boolean; ttlMinutes: number; message: string }>('/api/signup/resend', {
      email,
    });
  }
  verifySignupCode(email: string, code: string) {
    return this.http.post<{ ok: boolean; signupToken: string; expiresInMinutes: number }>(
      '/api/signup/verify',
      { email, code }
    );
  }
  registerSchool(signupToken: string, school: SchoolRegistration) {
    return this.http.post<{
      ok: boolean;
      school: { id: string; name: string; status: string };
      message: string;
    }>('/api/signup/school', { signupToken, ...school });
  }

  // ---- schools (platform console) ----
  schools() {
    return this.http.get<{ schools: School[]; pendingCount: number }>('/api/schools');
  }
  createSchool(body: unknown) {
    return this.http.post<{ school: School; admin: { email: string } }>('/api/schools', body);
  }
  moduleCatalogue() {
    return this.http.get<{ modules: ModuleDef[] }>('/api/schools/modules');
  }
  setSchoolModules(id: string, modules: string[]) {
    return this.http.put<{ school: School }>(`/api/schools/${id}/modules`, { modules });
  }
  updateSchool(id: string, body: unknown) {
    return this.http.put<{ school: School }>(`/api/schools/${id}`, body);
  }
  approveSchool(id: string) {
    return this.http.post<{ school: School }>(`/api/schools/${id}/approve`, {});
  }
  rejectSchool(id: string, reason: string) {
    return this.http.post<{ school: School }>(`/api/schools/${id}/reject`, { reason });
  }

  // ---- definitions ----
  definitions(all = false) {
    return this.http.get<{ definitions: ProcessDefinition[] }>('/api/definitions', {
      params: all ? { all: '1' } : {},
    });
  }
  definition(id: string) {
    return this.http.get<{ definition: ProcessDefinition }>(`/api/definitions/${id}`);
  }
  createDefinition(body: unknown) {
    return this.http.post<{ definition: ProcessDefinition }>('/api/definitions', body);
  }
  updateDefinition(id: string, body: unknown) {
    return this.http.put<{ definition: ProcessDefinition }>(`/api/definitions/${id}`, body);
  }
  deleteDefinition(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/definitions/${id}`);
  }

  // ---- instances ----
  createInstance(definitionId: string, data: Record<string, unknown>) {
    return this.http.post<{ instance: ProcessInstance }>('/api/instances', { definitionId, data });
  }
  myRequests(page: Page = {}) {
    return this.http.get<{ instances: ProcessInstance[]; total: number }>('/api/instances/mine', {
      params: queryParams({ ...page }),
    });
  }
  tasks(page: Page = {}) {
    return this.http.get<{ instances: ProcessInstance[]; total: number }>('/api/instances/tasks', {
      params: queryParams({ ...page }),
    });
  }
  allRequests(status?: string, page: Page = {}) {
    return this.http.get<{ instances: ProcessInstance[]; total: number }>('/api/instances', {
      params: queryParams({ status, ...page }),
    });
  }
  instance(id: string) {
    return this.http.get<{ instance: ProcessInstance; viewer: Viewer }>(`/api/instances/${id}`);
  }
  act(id: string, action: 'approve' | 'reject' | 'return', comment: string) {
    return this.http.post<{ instance: ProcessInstance; viewer: Viewer }>(
      `/api/instances/${id}/action`,
      { action, comment }
    );
  }
  resubmit(id: string, data: Record<string, unknown>, comment: string) {
    return this.http.post<{ instance: ProcessInstance; viewer: Viewer }>(
      `/api/instances/${id}/resubmit`,
      { data, comment }
    );
  }

  // ---- users ----
  users() {
    return this.http.get<{ users: UserProfile[] }>('/api/users');
  }
  createUser(body: unknown) {
    return this.http.post<{ user: UserProfile }>('/api/users', body);
  }
  updateUser(id: string, body: unknown) {
    return this.http.put<{ user: UserProfile }>(`/api/users/${id}`, body);
  }
  resetPassword(id: string, password: string) {
    return this.http.post<{ ok: boolean }>(`/api/users/${id}/reset-password`, { password });
  }

  // ---- roles ----
  roles() {
    return this.http.get<{ roles: Role[] }>('/api/roles');
  }
  permissions() {
    return this.http.get<{ permissions: PermissionDef[] }>('/api/roles/permissions');
  }
  createRole(body: unknown) {
    return this.http.post<{ role: Role }>('/api/roles', body);
  }
  updateRole(id: string, body: unknown) {
    return this.http.put<{ role: Role }>(`/api/roles/${id}`, body);
  }
  deleteRole(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/roles/${id}`);
  }

  // ---- email delivery ----
  emails(status?: string, page: Page = {}) {
    return this.http.get<{ emails: EmailDelivery[]; total: number; counts: EmailCounts }>('/api/emails', {
      params: queryParams({ status, ...page }),
    });
  }
  retryEmail(id: string) {
    return this.http.post<{ email: EmailDelivery }>(`/api/emails/${id}/retry`, {});
  }

  // ---- students, classes, subjects ----
  students(params: { q?: string; class?: string; status?: string } & Page = {}) {
    return this.http.get<{ students: Student[]; total: number }>('/api/students', {
      params: queryParams({ ...params }),
    });
  }
  createStudent(body: unknown) {
    return this.http.post<{ student: Student }>('/api/students', body);
  }
  updateStudent(id: string, body: unknown) {
    return this.http.put<{ student: Student }>(`/api/students/${id}`, body);
  }
  deleteStudent(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/students/${id}`);
  }
  importStudents(rows: unknown[], updateExisting: boolean) {
    return this.http.post<ImportResult>('/api/students/import', { rows, updateExisting });
  }

  classes() {
    return this.http.get<{ classes: SchoolClass[] }>('/api/classes');
  }
  createClass(body: unknown) {
    return this.http.post<{ class: SchoolClass }>('/api/classes', body);
  }
  updateClass(id: string, body: unknown) {
    return this.http.put<{ class: SchoolClass }>(`/api/classes/${id}`, body);
  }
  deleteClass(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/classes/${id}`);
  }
  assignStudentsToClass(id: string, studentIds: string[]) {
    return this.http.post<{ assigned: number }>(`/api/classes/${id}/students`, { studentIds });
  }

  subjects() {
    return this.http.get<{ subjects: Subject[] }>('/api/subjects');
  }
  createSubject(body: unknown) {
    return this.http.post<{ subject: Subject }>('/api/subjects', body);
  }
  updateSubject(id: string, body: unknown) {
    return this.http.put<{ subject: Subject }>(`/api/subjects/${id}`, body);
  }
  deleteSubject(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/subjects/${id}`);
  }

  // ---- notifications / dashboard / audit ----
  notifications() {
    return this.http.get<{ notifications: AppNotification[]; unread: number }>('/api/notifications');
  }
  markAllNotificationsRead() {
    return this.http.post<{ ok: boolean }>('/api/notifications/read-all', {});
  }
  stats() {
    return this.http.get<DashboardStats>('/api/dashboard/stats');
  }
  audit(page: Page = {}) {
    return this.http.get<{ logs: AuditEntry[]; total: number }>('/api/audit', {
      params: queryParams({ ...page }),
    });
  }

  // ---- exams & results ----
  exams(params: { class?: string; session?: string; term?: string; status?: string } = {}) {
    return this.http.get<{ exams: Exam[] }>('/api/exams', { params: queryParams({ ...params }) });
  }
  exam(id: string) {
    return this.http.get<{ exam: Exam }>(`/api/exams/${id}`);
  }
  createExam(body: unknown) {
    return this.http.post<{ exam: Exam }>('/api/exams', body);
  }
  updateExam(id: string, body: unknown) {
    return this.http.put<{ exam: Exam }>(`/api/exams/${id}`, body);
  }
  setExamStatus(id: string, status: ExamStatus) {
    return this.http.post<{ exam: Exam }>(`/api/exams/${id}/status`, { status });
  }
  deleteExam(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/exams/${id}`);
  }
  examResults(id: string) {
    return this.http.get<{ exam: Exam; rows: ResultRow[] }>(`/api/exams/${id}/results`);
  }
  saveResults(id: string, cells: { student: string; subject: string; score: number | null }[]) {
    return this.http.put<{ saved: number; cleared: number }>(`/api/exams/${id}/results`, { cells });
  }
  publishExam(id: string) {
    return this.http.post<{ exam: Exam } & PublishOutcome>(`/api/exams/${id}/publish`, {});
  }
  resultSheetUrl(examId: string, studentId: string) {
    return `/api/exams/${examId}/students/${studentId}/sheet`;
  }

  // ---- attendance ----
  register(classId: string, date: string) {
    return this.http.get<Register>('/api/attendance/register', { params: { class: classId, date } });
  }
  saveRegister(classId: string, date: string, records: { student: string; status: string; note?: string }[]) {
    return this.http.put<{ register: unknown }>('/api/attendance/register', { class: classId, date, records });
  }
  attendanceSummary(params: { class?: string; from?: string; to?: string } = {}) {
    return this.http.get<{ summary: AttendanceSummaryRow[] }>('/api/attendance/summary', {
      params: queryParams({ ...params }),
    });
  }

  // ---- report cards ----
  reportCards(examId: string) {
    return this.http.get<{ exam: Exam; students: ReportCardRow[] }>(`/api/reports/exam/${examId}`);
  }
  reportCardUrl(examId: string, studentId: string) {
    return `/api/reports/exam/${examId}/student/${studentId}`;
  }

  // ---- communications ----
  announcements(page: Page = {}) {
    return this.http.get<{ announcements: Announcement[]; total: number }>('/api/communications', {
      params: queryParams({ ...page }),
    });
  }
  audienceSize(audience: Audience, classId?: string) {
    const params: Record<string, string> = { audience };
    if (classId) params['class'] = classId;
    return this.http.get<{ count: number }>('/api/communications/audience', { params });
  }
  // ---- teachers ----
  teachers() {
    return this.http.get<TeacherDirectory>('/api/teachers');
  }

  sendAnnouncement(body: { subject: string; body: string; audience: Audience; class?: string }) {
    return this.http.post<{ announcement: Announcement; queued: number }>('/api/communications', body);
  }
}

export interface AuditEntry {
  _id: string;
  actorName?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}
