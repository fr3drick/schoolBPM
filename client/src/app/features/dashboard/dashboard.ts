import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { DashboardStats } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink, MatCardModule, MatIconModule, MatButtonModule,
    MatProgressBarModule, InstanceListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Welcome, {{ firstName() }}</h1>
        <span class="spacer"></span>
        @if (auth.hasPerm('instances.initiate')) {
          <button mat-flat-button color="primary" routerLink="/start">
            <mat-icon>add</mat-icon> Start a request
          </button>
        }
      </div>

      @if (!stats()) {
        <mat-progress-bar mode="indeterminate" />
      } @else if (stats(); as s) {
        <!-- Anything needing attention comes first, whatever module it is from:
             a register not taken and a student with no guardian address are
             both jobs for today, and neither used to appear here at all. -->
        @if (alerts().length) {
          <div class="alerts">
            @for (a of alerts(); track a.link + a.label) {
              <mat-card class="alert" [routerLink]="a.link">
                <mat-icon>{{ a.icon }}</mat-icon>
                <div>
                  <div class="alert-label">{{ a.label }}</div>
                  <div class="alert-hint">{{ a.hint }}</div>
                </div>
                <span class="spacer"></span>
                <mat-icon class="chevron">chevron_right</mat-icon>
              </mat-card>
            }
          </div>
        }

        @if (s.workflow; as w) {
          <h2>Requests</h2>
          <div class="cards">
            @if (auth.hasPerm('instances.act')) {
              <mat-card class="stat" routerLink="/approvals">
                <div class="num accent">{{ w.myTasks }}</div>
                <div class="label">Awaiting my action</div>
              </mat-card>
            }
            <mat-card class="stat" routerLink="/requests">
              <div class="num">{{ w.myOpen }}</div>
              <div class="label">My open requests</div>
            </mat-card>
            @if (w.totals; as t) {
              <mat-card class="stat" routerLink="/all">
                <div class="num">{{ t.in_progress }}</div>
                <div class="label">In progress school-wide</div>
              </mat-card>
              <mat-card class="stat" routerLink="/all">
                <div class="num green">{{ t.approved }}</div>
                <div class="label">Approved school-wide</div>
              </mat-card>
            }
          </div>
        }

        @if (s.students; as st) {
          <h2>Students</h2>
          <div class="cards">
            <mat-card class="stat" routerLink="/students">
              <div class="num">{{ st.active }}</div>
              <div class="label">Active on roll</div>
            </mat-card>
            <mat-card class="stat" routerLink="/students">
              <div class="num" [class.amber]="st.missingGuardian > 0">{{ st.missingGuardian }}</div>
              <div class="label">Without a guardian email</div>
            </mat-card>
          </div>
        }

        @if (s.exams; as ex) {
          <h2>Exams</h2>
          <div class="cards">
            <mat-card class="stat" routerLink="/exams">
              <div class="num accent">{{ ex.open }}</div>
              <div class="label">Open for results entry</div>
            </mat-card>
            <mat-card class="stat" routerLink="/exams">
              <div class="num">{{ ex.draft }}</div>
              <div class="label">Draft</div>
            </mat-card>
            <mat-card class="stat" routerLink="/exams">
              <div class="num green">{{ ex.published }}</div>
              <div class="label">Published</div>
            </mat-card>
          </div>
        }

        @if (s.attendance; as at) {
          <h2>Attendance</h2>
          <div class="cards">
            <mat-card class="stat" routerLink="/attendance">
              <div class="num" [class.amber]="at.missingToday > 0" [class.green]="at.missingToday === 0">
                {{ at.takenToday }}/{{ at.classCount }}
              </div>
              <div class="label">Registers taken today</div>
            </mat-card>
          </div>
        }

        @if (s.workflow && auth.hasPerm('instances.initiate')) {
          <h2>My recent requests</h2>
          <app-instance-list [instances]="s.workflow.recentMine" emptyMessage="You haven't started any requests yet" />
        }

        @if (!s.workflow && !s.students && !s.exams && !s.attendance) {
          <mat-card class="nothing">
            <mat-icon>widgets</mat-icon>
            <div>
              <b>Nothing to show here yet</b>
              <p>
                Your account does not yet have access to any of this school's modules.
                An administrator can grant permissions under Roles &amp; permissions.
              </p>
            </div>
          </mat-card>
        }
      }
    </div>
  `,
  styles: `
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat { padding: 20px; cursor: pointer; transition: box-shadow .15s; }
    .stat:hover { box-shadow: 0 3px 10px rgba(0,0,0,.15); }
    .num { font-size: 34px; font-weight: 600; }
    .num.accent { color: #1565c0; }
    .num.green { color: #2e7d32; }
    .num.amber { color: #b26a00; }
    .label { color: #78909c; font-size: 13px; margin-top: 2px; }
    h2 { font-size: 17px; font-weight: 500; margin: 0 0 12px; }
    .alerts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
    .alert {
      /* flex-direction is explicit: mat-card's own rule sets column, which
         stacks the icon above the text and drops the chevron underneath. */
      display: flex; flex-direction: row; align-items: center;
      gap: 14px; padding: 12px 16px;
      cursor: pointer; border-left: 4px solid #b26a00; background: #fffaf2;
    }
    .alert:hover { background: #fff5e6; }
    .alert > mat-icon { color: #b26a00; }
    .alert-label { font-weight: 600; }
    .alert-hint { font-size: 12px; color: #78909c; margin-top: 1px; }
    .chevron { color: #b0bec5; }
    .nothing { display: flex; gap: 16px; padding: 24px; align-items: flex-start; color: #546e7a; }
    .nothing mat-icon { color: #90a4ae; }
    .nothing p { margin: 6px 0 0; font-size: 13px; line-height: 1.5; }
    @media (max-width: 599px) {
      .cards { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
      .stat { padding: 14px; }
      .num { font-size: 26px; }
    }
  `,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  stats = signal<DashboardStats | null>(null);

  /**
   * The things that are wrong right now, across whichever modules the viewer
   * can see. Deliberately short: a list of five "alerts" is a list of none.
   */
  alerts = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const out: { icon: string; label: string; hint: string; link: string }[] = [];
    if (s.attendance && s.attendance.missingToday > 0) {
      out.push({
        icon: 'how_to_reg',
        label: `${s.attendance.missingToday} register${s.attendance.missingToday === 1 ? '' : 's'} not taken today`,
        hint: `${s.attendance.takenToday} of ${s.attendance.classCount} classes are done`,
        link: '/attendance',
      });
    }
    if (s.students && s.students.missingGuardian > 0) {
      out.push({
        icon: 'mark_email_unread',
        label: `${s.students.missingGuardian} student${s.students.missingGuardian === 1 ? '' : 's'} without a guardian email`,
        hint: 'Report cards cannot be sent for these students',
        link: '/students',
      });
    }
    if (s.workflow && s.workflow.myTasks > 0) {
      out.push({
        icon: 'fact_check',
        label: `${s.workflow.myTasks} request${s.workflow.myTasks === 1 ? '' : 's'} waiting for you`,
        hint: 'Your role is the current approver',
        link: '/approvals',
      });
    }
    return out;
  });

  constructor() {
    if (this.auth.isPlatformAdmin()) {
      // Platform staff have no school dashboard — their home is the console.
      inject(Router).navigate(['/platform/schools']);
      return;
    }
    this.api.stats().subscribe((s) => this.stats.set(s));
  }

  firstName(): string {
    return this.auth.user()?.name.split(' ')[0] ?? '';
  }
}
