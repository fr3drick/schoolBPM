import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  AppNotification,
  DashboardStats,
  PermissionDef,
  ProcessDefinition,
  ProcessInstance,
  EmailCounts,
  EmailDelivery,
  Role,
  School,
  SchoolRegistration,
  UserProfile,
  Viewer,
} from './models';

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
  myRequests() {
    return this.http.get<{ instances: ProcessInstance[] }>('/api/instances/mine');
  }
  tasks() {
    return this.http.get<{ instances: ProcessInstance[] }>('/api/instances/tasks');
  }
  allRequests(status?: string) {
    return this.http.get<{ instances: ProcessInstance[] }>('/api/instances', {
      params: status ? { status } : {},
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
  emails(status?: string) {
    return this.http.get<{ emails: EmailDelivery[]; counts: EmailCounts }>('/api/emails', {
      params: status ? { status } : {},
    });
  }
  retryEmail(id: string) {
    return this.http.post<{ email: EmailDelivery }>(`/api/emails/${id}/retry`, {});
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
  audit() {
    return this.http.get<{ logs: AuditEntry[] }>('/api/audit');
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
