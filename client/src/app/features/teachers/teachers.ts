import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Teacher } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';
import { LoadingBarComponent } from '../../shared/loading-bar';

/**
 * The teaching staff directory.
 *
 * Read-only by design: accounts are created and edited in Administration →
 * Users, and a second screen that edited the same records would be one more
 * place to keep consistent for no gain. What this adds is the view a head of
 * school actually wants — who teaches here, which classes they hold, and who
 * has not signed in yet.
 */
@Component({
  selector: 'app-teachers',
  imports: [
    FormsModule, RouterLink, MatButtonModule, MatIconModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    LoadingBarComponent,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Teachers</h1>
          <div class="muted">
            {{ filtered().length }} of {{ teachers().length }} teaching staff
          </div>
        </div>
        @if (canManageUsers()) {
          <a mat-stroked-button routerLink="/admin/users">
            <mat-icon>group</mat-icon> Manage accounts
          </a>
        }
      </div>

      @if (loaded() && !configured()) {
        <div class="notice">
          <mat-icon>info</mat-icon>
          <div>
            No role is marked as teaching staff yet, so there is nobody to list.
            Open a role in
            @if (canManageRoles()) {
              <a routerLink="/admin/roles">Roles &amp; permissions</a>
            } @else {
              <b>Administration → Roles &amp; permissions</b>
            }
            and tick <b>Teaching staff</b>.
          </div>
        </div>
      }

      @if (configured()) {
        <div class="filters">
          <mat-form-field appearance="outline">
            <mat-label>Search name or email</mat-label>
            <input matInput [ngModel]="search()" (ngModelChange)="search.set($event)" />
            <mat-icon matIconSuffix>search</mat-icon>
          </mat-form-field>
          @if (roles().length > 1) {
            <mat-form-field appearance="outline">
              <mat-label>Role</mat-label>
              <mat-select [ngModel]="roleFilter()" (ngModelChange)="roleFilter.set($event)">
                <mat-option [value]="''">All teaching roles</mat-option>
                @for (r of roles(); track r) {
                  <mat-option [value]="r">{{ r }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>
      }

      <div class="table-card">
        <app-loading-bar [active]="loading()" />
        @if (loaded() && configured() && !filtered().length) {
          <div class="empty-state">
            <mat-icon>groups</mat-icon>
            <div>
              {{ teachers().length ? 'No teacher matches those filters.' : 'No accounts hold a teaching role yet.' }}
            </div>
          </div>
        } @else if (filtered().length) {
          <table mat-table [dataSource]="filtered()">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Teacher</th>
              <td mat-cell *matCellDef="let t">
                <div class="name">{{ t.name }}</div>
                <div class="muted small">{{ t.email }}</div>
              </td>
            </ng-container>

            <ng-container matColumnDef="role">
              <th mat-header-cell *matHeaderCellDef>Role</th>
              <td mat-cell *matCellDef="let t"><span class="chip">{{ t.role }}</span></td>
            </ng-container>

            <ng-container matColumnDef="classes">
              <th mat-header-cell *matHeaderCellDef>Form teacher of</th>
              <td mat-cell *matCellDef="let t">
                @if (!t.formClasses.length) {
                  <span class="muted">—</span>
                } @else {
                  @for (c of t.formClasses; track c._id) {
                    <span class="chip class" [class.inactive]="!c.active">{{ c.name }}</span>
                  }
                }
              </td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let t">
                @if (!t.active) {
                  <span class="chip off">Deactivated</span>
                } @else if (t.mustChangePassword) {
                  <span class="chip pending" matTooltip="Has not signed in and changed their temporary password">
                    Not signed in
                  </span>
                } @else {
                  <span class="chip ok">Active</span>
                }
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" [class.dim]="!row.active"></tr>
          </table>
        }
      </div>
    </div>
  `,
  styles: `
    .page { padding: 24px 28px; max-width: 1080px; }
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; gap: 16px; }
    h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .muted { color: #78909c; }
    .small { font-size: 12px; }
    .name { font-weight: 500; }
    .filters { display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .filters mat-form-field { min-width: 260px; }
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .notice {
      display: flex; gap: 12px; align-items: flex-start; background: #f5f9ff;
      border: 1px solid #d0e2f7; border-radius: 8px; padding: 14px 16px;
      margin-bottom: 16px; color: #37474f; font-size: 13px; line-height: 1.55;
    }
    .notice mat-icon { color: #1565c0; }
    .notice a { color: #1565c0; }
    .chip { border-radius: 12px; padding: 3px 11px; font-size: 12px; font-weight: 500; background: #eceff1; color: #546e7a; }
    .chip.class { background: #e3f2fd; color: #1565c0; margin-right: 6px; }
    .chip.class.inactive { background: #f5f5f5; color: #9e9e9e; }
    .chip.ok { background: #e8f5e9; color: #2e7d32; }
    .chip.pending { background: #fff8e1; color: #8a6100; }
    .chip.off { background: #ffebee; color: #c62828; }
    .dim { opacity: .6; }
    .empty-state { padding: 56px 20px; text-align: center; color: #90a4ae; }
    .empty-state mat-icon { font-size: 42px; width: 42px; height: 42px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeachersComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  teachers = signal<Teacher[]>([]);
  configured = signal(true);
  loading = signal(false);
  loaded = signal(false);
  search = signal('');
  roleFilter = signal('');

  columns = ['name', 'role', 'classes', 'status'];

  canManageUsers = computed(() => this.auth.hasPerm('users.manage'));
  canManageRoles = computed(() => this.auth.hasPerm('roles.manage'));

  /** Distinct teaching roles actually held, so the filter offers real options. */
  roles = computed(() => [...new Set(this.teachers().map((t) => t.role))].sort());

  filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    return this.teachers().filter((t) => {
      if (role && t.role !== role) return false;
      if (!term) return true;
      return t.name.toLowerCase().includes(term) || t.email.toLowerCase().includes(term);
    });
  });

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.teachers().subscribe({
      next: (r) => {
        this.teachers.set(r.teachers);
        this.configured.set(r.configured);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 6000 });
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }
}
