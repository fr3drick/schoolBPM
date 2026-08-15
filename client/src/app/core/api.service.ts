import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  AppNotification,
  DashboardStats,
  PermissionDef,
  ProcessDefinition,
  ProcessInstance,
  Role,
  School,
  UserProfile,
  Viewer,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // ---- auth ----
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<{ ok: boolean }>('/api/auth/change-password', { currentPassword, newPassword });
  }

  // ---- schools (platform console) ----
  schools() {
    return this.http.get<{ schools: School[] }>('/api/schools');
  }
  createSchool(body: unknown) {
    return this.http.post<{ school: School; admin: { email: string } }>('/api/schools', body);
  }
  updateSchool(id: string, body: unknown) {
    return this.http.put<{ school: School }>(`/api/schools/${id}`, body);
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
