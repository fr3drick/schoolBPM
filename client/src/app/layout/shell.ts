import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { interval, startWith, switchMap } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { AppNotification } from '../core/models';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  exact?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, DatePipe,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatBadgeModule, MatDividerModule,
  ],
  template: `
    <mat-sidenav-container class="container">
      <mat-sidenav mode="side" [opened]="sidenavOpen()" class="sidenav">
        <div class="brand">
          <mat-icon>school</mat-icon>
          <span>School BPM</span>
        </div>
        @if (auth.user()?.school; as school) {
          <div class="tenant">{{ school.name }}</div>
        } @else if (auth.isPlatformAdmin()) {
          <div class="tenant">Platform console</div>
        }
        <mat-nav-list>
          @for (item of mainNav(); track item.link) {
            <a mat-list-item [routerLink]="item.link" routerLinkActive="active-link"
               [routerLinkActiveOptions]="{ exact: item.exact ?? false }">
              <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
              <span matListItemTitle>{{ item.label }}</span>
            </a>
          }
          @if (adminNav().length) {
            <mat-divider />
            <div class="nav-section">Administration</div>
            @for (item of adminNav(); track item.link) {
              <a mat-list-item [routerLink]="item.link" routerLinkActive="active-link">
                <mat-icon matListItemIcon>{{ item.icon }}</mat-icon>
                <span matListItemTitle>{{ item.label }}</span>
              </a>
            }
          }
        </mat-nav-list>
      </mat-sidenav>

      <mat-sidenav-content class="content">
        <mat-toolbar class="toolbar">
          <button mat-icon-button (click)="sidenavOpen.set(!sidenavOpen())" aria-label="Toggle menu">
            <mat-icon>menu</mat-icon>
          </button>
          <span class="spacer"></span>

          <button mat-icon-button [matMenuTriggerFor]="notifMenu" (menuOpened)="onNotifOpened()" aria-label="Notifications">
            @if (unread() > 0) {
              <mat-icon [matBadge]="unread()" matBadgeColor="warn" matBadgeSize="small">notifications</mat-icon>
            } @else {
              <mat-icon>notifications_none</mat-icon>
            }
          </button>
          <mat-menu #notifMenu="matMenu" class="notif-menu" xPosition="before">
            <div class="notif-header" (click)="$event.stopPropagation()">
              <b>Notifications</b>
              <span class="spacer"></span>
              @if (unread() > 0) {
                <button mat-button (click)="markAllRead()">Mark all read</button>
              }
            </div>
            @if (notifications().length === 0) {
              <div class="notif-empty">You're all caught up</div>
            }
            @for (n of notifications(); track n._id) {
              <button mat-menu-item class="notif-item" [class.unread]="!n.read" (click)="openNotification(n)">
                <div class="notif-message">{{ n.message }}</div>
                <div class="notif-time">{{ n.createdAt | date: 'MMM d, h:mm a' }}</div>
              </button>
            }
          </mat-menu>

          <button mat-button [matMenuTriggerFor]="userMenu" class="user-btn">
            <mat-icon>account_circle</mat-icon>
            {{ auth.user()?.name }}
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <div class="user-info" (click)="$event.stopPropagation()">
              <div class="user-name">{{ auth.user()?.name }}</div>
              <div class="user-role">{{ auth.user()?.role?.name }} · {{ auth.user()?.email }}</div>
            </div>
            <mat-divider />
            <button mat-menu-item routerLink="/change-password">
              <mat-icon>vpn_key</mat-icon> Change password
            </button>
            <button mat-menu-item (click)="auth.logout()">
              <mat-icon>logout</mat-icon> Sign out
            </button>
          </mat-menu>
        </mat-toolbar>

        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .container { height: 100%; }
    .sidenav { width: 240px; }
    .brand {
      display: flex; align-items: center; gap: 10px; padding: 18px 16px 4px;
      font-size: 18px; font-weight: 600; color: #1565c0;
    }
    .tenant {
      padding: 0 16px 12px 42px; font-size: 12px; color: #78909c;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .nav-section {
      padding: 14px 16px 4px; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: .8px; color: #90a4ae;
    }
    .active-link { --mat-list-list-item-container-color: #e3f2fd; --mdc-list-list-item-label-text-color: #1565c0; }
    .toolbar { background: #fff; border-bottom: 1px solid #e0e0e0; position: sticky; top: 0; z-index: 10; }
    .content { display: flex; flex-direction: column; }
    .user-btn { text-transform: none; }
    .user-info { padding: 12px 16px; min-width: 220px; }
    .user-name { font-weight: 600; }
    .user-role { font-size: 12px; color: #78909c; }
    .notif-header { display: flex; align-items: center; padding: 8px 16px; min-width: 340px; }
    .notif-empty { padding: 20px 16px; color: #78909c; }
    .notif-item { height: auto; padding: 10px 16px; line-height: 1.35; border-left: 3px solid transparent; }
    .notif-item.unread { border-left-color: #1565c0; background: #f5f9ff; }
    .notif-message { white-space: normal; max-width: 340px; font-size: 13px; }
    .notif-time { font-size: 11px; color: #90a4ae; margin-top: 2px; }
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  sidenavOpen = signal(true);
  notifications = signal<AppNotification[]>([]);
  unread = signal(0);

  mainNav = computed<NavItem[]>(() => {
    if (this.auth.isPlatformAdmin()) {
      return [{ label: 'Schools', icon: 'domain', link: '/platform/schools' }];
    }
    const items: NavItem[] = [{ label: 'Dashboard', icon: 'dashboard', link: '/', exact: true }];
    if (this.auth.canUse('workflow', 'instances.initiate')) {
      items.push({ label: 'Start a request', icon: 'add_circle', link: '/start' });
      // Exact: the request detail page lives at /requests/:id, and anyone with
      // instances.view_all reaches it from All requests or Approvals. Prefix
      // matching would highlight "My requests" for a request that is not theirs.
      items.push({ label: 'My requests', icon: 'list_alt', link: '/requests', exact: true });
    }
    if (this.auth.canUse('workflow', 'instances.act')) {
      items.push({ label: 'Approvals', icon: 'fact_check', link: '/approvals' });
    }
    if (this.auth.canUse('workflow', 'instances.view_all')) {
      items.push({ label: 'All requests', icon: 'folder_open', link: '/all' });
    }
    if (this.auth.canUse('students', 'students.view', 'students.manage')) {
      items.push({ label: 'Students', icon: 'school', link: '/students' });
    }
    if (this.auth.canUse('students', 'classes.manage', 'students.view')) {
      items.push({ label: 'Classes', icon: 'groups', link: '/classes' });
    }
    if (this.auth.canUse('students', 'subjects.manage', 'students.view')) {
      items.push({ label: 'Subjects', icon: 'menu_book', link: '/subjects' });
    }
    if (this.auth.canUse('exams', 'exams.manage', 'results.enter', 'results.view')) {
      // Prefix matching is right here: /exams/:id is the results grid for one
      // of these exams, not a separate destination.
      items.push({ label: 'Exams', icon: 'grading', link: '/exams' });
    }
    if (this.auth.canUse('attendance', 'attendance.take', 'attendance.view')) {
      items.push({ label: 'Attendance', icon: 'how_to_reg', link: '/attendance' });
    }
    if (this.auth.canUse('reports', 'reports.issue', 'reports.view')) {
      items.push({ label: 'Report cards', icon: 'description', link: '/reports' });
    }
    if (this.auth.canUse('communications', 'comms.send', 'comms.view')) {
      items.push({ label: 'Communications', icon: 'campaign', link: '/communications' });
    }
    return items;
  });

  adminNav = computed<NavItem[]>(() => {
    const items: NavItem[] = [];
    if (this.auth.hasPerm('users.manage')) items.push({ label: 'Users', icon: 'group', link: '/admin/users' });
    if (this.auth.hasPerm('roles.manage')) items.push({ label: 'Roles & permissions', icon: 'admin_panel_settings', link: '/admin/roles' });
    if (this.auth.canUse('workflow', 'definitions.manage')) items.push({ label: 'Process designer', icon: 'account_tree', link: '/admin/processes' });
    if (this.auth.hasPerm('email.view')) items.push({ label: 'Email delivery', icon: 'mark_email_unread', link: '/admin/emails' });
    if (this.auth.hasPerm('audit.view')) items.push({ label: 'Audit log', icon: 'history', link: '/audit' });
    return items;
  });

  constructor() {
    interval(30000)
      .pipe(startWith(0), switchMap(() => this.api.notifications()), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.notifications.set(res.notifications);
          this.unread.set(res.unread);
        },
        error: () => {},
      });
  }

  onNotifOpened() {
    this.api.notifications().subscribe((res) => {
      this.notifications.set(res.notifications);
      this.unread.set(res.unread);
    });
  }

  markAllRead() {
    this.api.markAllNotificationsRead().subscribe(() => {
      this.unread.set(0);
      this.notifications.update((list) => list.map((n) => ({ ...n, read: true })));
    });
  }

  openNotification(n: AppNotification) {
    if (n.instance) this.router.navigate(['/requests', n.instance]);
  }
}
