import { Component, Inject, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { School } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';

@Component({
  selector: 'app-onboard-school-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Onboard a school</h2>
    <mat-dialog-content class="content">
      <div class="section">School</div>
      <mat-form-field appearance="outline">
        <mat-label>School name</mat-label>
        <input matInput [(ngModel)]="name" (blur)="suggestSlug()" placeholder="e.g. Green Valley High School" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Slug</mat-label>
        <input matInput [(ngModel)]="slug" placeholder="green-valley" />
        <mat-hint>Lowercase letters, digits and hyphens — permanent identifier</mat-hint>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Contact email (optional)</mat-label>
        <input matInput type="email" [(ngModel)]="contactEmail" />
      </mat-form-field>

      <div class="section">First Super Admin account</div>
      <mat-form-field appearance="outline">
        <mat-label>Admin name</mat-label>
        <input matInput [(ngModel)]="adminName" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Admin email</mat-label>
        <input matInput type="email" [(ngModel)]="adminEmail" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Temporary password</mat-label>
        <input matInput [(ngModel)]="adminPassword" />
        <mat-hint>At least 8 characters — they must change it at first sign-in</mat-hint>
      </mat-form-field>

      <mat-checkbox [(ngModel)]="seedTemplates" class="seed">
        Include the 5 starter process templates (leave, purchases, field trips…)
      </mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!valid()" (click)="save()">Onboard school</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 420px; padding-top: 8px; }
    .section {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px;
      color: #90a4ae; margin: 6px 0 10px;
    }
    .seed { margin: 4px 0 8px; }
  `,
})
export class OnboardSchoolDialogComponent {
  name = '';
  slug = '';
  contactEmail = '';
  adminName = '';
  adminEmail = '';
  adminPassword = '';
  seedTemplates = true;

  constructor(public ref: MatDialogRef<OnboardSchoolDialogComponent>) {}

  suggestSlug() {
    if (!this.slug.trim() && this.name.trim()) {
      this.slug = this.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
  }

  valid(): boolean {
    return (
      !!this.name.trim() &&
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(this.slug) &&
      !!this.adminName.trim() &&
      !!this.adminEmail.trim() &&
      this.adminPassword.length >= 8
    );
  }

  save() {
    this.ref.close({
      name: this.name.trim(),
      slug: this.slug,
      contactEmail: this.contactEmail.trim(),
      adminName: this.adminName.trim(),
      adminEmail: this.adminEmail.trim(),
      adminPassword: this.adminPassword,
      seedTemplates: this.seedTemplates,
    });
  }
}

/**
 * The review sheet for a self-registered school: everything the applicant
 * told us, then approve or reject. Rejecting demands a reason — it is what
 * the school is shown and emailed, so "no" without one is not an answer.
 */
@Component({
  selector: 'app-review-school-dialog',
  imports: [DatePipe, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Review registration</h2>
    <mat-dialog-content class="content">
      <div class="school-name">{{ data.name }}</div>
      <div class="muted mono">{{ data.slug }}</div>

      <div class="section">Registered by</div>
      <div class="pair"><span>Name</span><b>{{ data.admin?.name || '—' }}</b></div>
      <div class="pair"><span>Email</span><b>{{ data.admin?.email || '—' }}</b></div>
      <div class="pair"><span>Submitted</span><b>{{ data.submittedAt | date: 'MMM d, y, h:mm a' }}</b></div>

      <div class="section">School details</div>
      <div class="pair"><span>Contact email</span><b>{{ data.contactEmail || '—' }}</b></div>
      <div class="pair"><span>Phone</span><b>{{ data.contactPhone || '—' }}</b></div>
      <div class="pair"><span>Address</span><b>{{ data.address || '—' }}</b></div>
      <div class="pair"><span>Location</span><b>{{ location() || '—' }}</b></div>
      <div class="pair"><span>Website</span><b>{{ data.website || '—' }}</b></div>
      <div class="pair"><span>Staff</span><b>{{ data.staffCount ?? '—' }}</b></div>

      @if (data.status === 'rejected' && data.rejectionReason) {
        <div class="prior">
          <b>Previously rejected:</b> {{ data.rejectionReason }}
        </div>
      }

      @if (rejecting()) {
        <mat-form-field appearance="outline" class="reason">
          <mat-label>Reason for rejection</mat-label>
          <textarea matInput rows="3" [(ngModel)]="reason" maxlength="500"
                    placeholder="Shown to the school and included in the email we send them"></textarea>
          <mat-hint>{{ reason.length }}/500</mat-hint>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (rejecting()) {
        <button mat-button (click)="rejecting.set(false)">Back</button>
        <button mat-flat-button color="warn" [disabled]="!reason.trim()"
                (click)="ref.close({ action: 'reject', reason: reason.trim() })">
          Confirm rejection
        </button>
      } @else {
        <button mat-button mat-dialog-close>Cancel</button>
        <button mat-button color="warn" (click)="rejecting.set(true)">Reject</button>
        <button mat-flat-button color="primary" (click)="ref.close({ action: 'approve' })">
          <mat-icon>check</mat-icon> Approve school
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 420px; padding-top: 8px; }
    .school-name { font-size: 17px; font-weight: 600; }
    .mono { font-family: monospace; font-size: 12px; }
    .section {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px;
      color: #90a4ae; margin: 18px 0 8px;
    }
    .pair { display: flex; gap: 12px; font-size: 14px; padding: 4px 0; }
    .pair span { color: #78909c; min-width: 118px; }
    .pair b { font-weight: 500; word-break: break-word; }
    .prior { background: #ffebee; color: #8e2020; border-radius: 6px; padding: 10px 12px; font-size: 13px; margin-top: 16px; line-height: 1.5; }
    .reason { margin-top: 18px; }
  `,
})
export class ReviewSchoolDialogComponent {
  rejecting = signal(false);
  reason = '';

  constructor(
    public ref: MatDialogRef<ReviewSchoolDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: School
  ) {}

  location() {
    return [this.data.city, this.data.state, this.data.country].filter(Boolean).join(', ');
  }
}

type SchoolTab = 'pending' | 'approved' | 'rejected' | 'all';

@Component({
  selector: 'app-schools',
  imports: [
    DatePipe, MatTableModule, MatIconModule, MatButtonModule, MatSlideToggleModule,
    MatDialogModule, MatTabsModule, MatTooltipModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Schools</h1>
        <span class="muted">Tenants on this platform</span>
        <span class="spacer"></span>
        <button mat-flat-button color="primary" (click)="onboard()">
          <mat-icon>add_business</mat-icon> Onboard school
        </button>
      </div>

      @if (pendingCount() > 0) {
        <div class="review-banner" (click)="filter.set('pending')">
          <mat-icon>pending_actions</mat-icon>
          <div>
            <b>{{ pendingCount() }} school{{ pendingCount() === 1 ? '' : 's' }} waiting for review</b>
            <div class="muted">Registered through public signup — approve to make them live.</div>
          </div>
          <span class="spacer"></span>
          <button mat-stroked-button>Review</button>
        </div>
      }

      <mat-tab-group [selectedIndex]="tabIndex()" (selectedIndexChange)="onTab($event)" class="tabs">
        @for (t of tabs; track t.key) {
          <mat-tab [label]="t.label + ' (' + countFor(t.key) + ')'" />
        }
      </mat-tab-group>

      <div class="table-card">
        <table mat-table [dataSource]="visible()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>School</th>
            <td mat-cell *matCellDef="let s">
              <b>{{ s.name }}</b>
              <div class="muted mono">
                {{ s.slug }}
                @if (s.selfSignup) { <span class="tag" matTooltip="Registered through public signup">self-registered</span> }
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="contact">
            <th mat-header-cell *matHeaderCellDef>Contact</th>
            <td mat-cell *matCellDef="let s">
              {{ s.contactEmail || '—' }}
              @if (s.admin) { <div class="muted">{{ s.admin.name }}</div> }
            </td>
          </ng-container>
          <ng-container matColumnDef="users">
            <th mat-header-cell *matHeaderCellDef>Users</th>
            <td mat-cell *matCellDef="let s">{{ s.userCount }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let s">
              <span class="status-chip" [class]="chipClass(s)">{{ statusLabel(s) }}</span>
              @if (s.status === 'rejected' && s.rejectionReason) {
                <mat-icon class="why" [matTooltip]="s.rejectionReason">info_outline</mat-icon>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>Registered</th>
            <td mat-cell *matCellDef="let s">{{ (s.submittedAt || s.createdAt) | date: 'MMM d, y' }}</td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>Access</th>
            <td mat-cell *matCellDef="let s">
              @if (s.status === 'approved') {
                <mat-slide-toggle [checked]="s.active" (change)="toggle(s, $event.checked)"
                                  matTooltip="Suspend or reactivate this school" />
              } @else {
                <button mat-stroked-button color="primary" (click)="review(s)">
                  {{ s.status === 'pending' ? 'Review' : 'Reconsider' }}
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
        @if (visible().length === 0 && loaded()) {
          <div class="empty-state">
            <mat-icon>domain</mat-icon>
            <div>{{ emptyMessage() }}</div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .mono { font-family: monospace; font-size: 12px; }
    .tag {
      font-family: Roboto, sans-serif; background: #ede7f6; color: #5e35b1;
      border-radius: 8px; padding: 1px 7px; font-size: 10px; margin-left: 6px; letter-spacing: .2px;
    }
    .review-banner {
      display: flex; align-items: center; gap: 14px; cursor: pointer;
      background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px;
      padding: 14px 18px; margin-bottom: 18px; color: #8a6100;
    }
    .review-banner mat-icon { color: #b26a00; }
    .review-banner .muted { font-size: 12px; }
    .tabs { margin-bottom: 12px; }
    .status-chip.pending { background: #fff8e1; color: #b26a00; }
    .why { font-size: 16px; width: 16px; height: 16px; color: #b0bec5; vertical-align: middle; margin-left: 4px; }
  `,
})
export class SchoolsComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  readonly tabs: { key: SchoolTab; label: string }[] = [
    { key: 'pending', label: 'Pending review' },
    { key: 'approved', label: 'Live' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ];

  schools = signal<School[]>([]);
  pendingCount = signal(0);
  loaded = signal(false);
  filter = signal<SchoolTab>('approved');
  columns = ['name', 'contact', 'users', 'status', 'created', 'actions'];

  tabIndex = computed(() => this.tabs.findIndex((t) => t.key === this.filter()));
  visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.schools() : this.schools().filter((s) => s.status === f);
  });
  emptyMessage = computed(() => {
    switch (this.filter()) {
      case 'pending': return 'Nothing waiting for review.';
      case 'rejected': return 'No rejected registrations.';
      case 'approved': return 'No live schools yet — onboard or approve one.';
      default: return 'No schools yet — onboard the first one.';
    }
  });

  constructor() {
    this.reload();
  }

  countFor(key: string): number {
    return key === 'all' ? this.schools().length : this.schools().filter((s) => s.status === key).length;
  }

  statusLabel(s: School): string {
    if (s.status === 'pending') return 'Pending review';
    if (s.status === 'rejected') return 'Rejected';
    return s.active ? 'Active' : 'Suspended';
  }

  chipClass(s: School): string {
    if (s.status === 'pending') return 'pending';
    if (s.status === 'rejected') return 'rejected';
    return s.active ? 'approved' : 'inactive';
  }

  onTab(index: number) {
    this.filter.set(this.tabs[index].key);
  }

  reload() {
    this.api.schools().subscribe((res) => {
      this.schools.set(res.schools);
      this.pendingCount.set(res.pendingCount);
      // Open on the review queue when something is waiting, but only on the
      // first load — later reloads must not yank the tab out from under a
      // reviewer who has deliberately switched away.
      if (!this.loaded() && res.pendingCount > 0) this.filter.set('pending');
      this.loaded.set(true);
    });
  }

  onboard() {
    this.dialog
      .open(OnboardSchoolDialogComponent, { width: '480px' })
      .afterClosed()
      .subscribe((body) => {
        if (!body) return;
        this.api.createSchool(body).subscribe({
          next: (res) => {
            this.snack.open(
              `${res.school.name} onboarded — share the temporary password with ${res.admin.email}`,
              'OK',
              { duration: 6000 }
            );
            this.filter.set('approved');
            this.reload();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
        });
      });
  }

  review(school: School) {
    this.dialog
      .open(ReviewSchoolDialogComponent, { width: '520px', data: school })
      .afterClosed()
      .subscribe((result: { action: 'approve' | 'reject'; reason?: string } | '' | undefined) => {
        // Cancel closes with '' (a bare mat-dialog-close), not undefined.
        if (!result) return;
        const request =
          result.action === 'approve'
            ? this.api.approveSchool(school._id)
            : this.api.rejectSchool(school._id, result.reason ?? '');
        request.subscribe({
          next: () => {
            this.snack.open(
              result.action === 'approve'
                ? `${school.name} approved — its Super Admin has been emailed`
                : `${school.name} rejected — the reason has been emailed`,
              'OK',
              { duration: 5000 }
            );
            this.reload();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
        });
      });
  }

  toggle(school: School, active: boolean) {
    this.api.updateSchool(school._id, { active }).subscribe({
      next: () => this.reload(),
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        this.reload();
      },
    });
  }
}
