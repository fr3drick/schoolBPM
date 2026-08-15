import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
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

@Component({
  selector: 'app-schools',
  imports: [DatePipe, MatTableModule, MatIconModule, MatButtonModule, MatSlideToggleModule, MatDialogModule],
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

      <div class="table-card">
        <table mat-table [dataSource]="schools()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>School</th>
            <td mat-cell *matCellDef="let s">
              <b>{{ s.name }}</b>
              <div class="muted mono">{{ s.slug }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="contact">
            <th mat-header-cell *matHeaderCellDef>Contact</th>
            <td mat-cell *matCellDef="let s">{{ s.contactEmail || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="users">
            <th mat-header-cell *matHeaderCellDef>Users</th>
            <td mat-cell *matCellDef="let s">{{ s.userCount }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let s">
              <span class="status-chip" [class.approved]="s.active" [class.inactive]="!s.active">
                {{ s.active ? 'Active' : 'Suspended' }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>Onboarded</th>
            <td mat-cell *matCellDef="let s">{{ s.createdAt | date: 'MMM d, y' }}</td>
          </ng-container>
          <ng-container matColumnDef="active">
            <th mat-header-cell *matHeaderCellDef>Access</th>
            <td mat-cell *matCellDef="let s">
              <mat-slide-toggle [checked]="s.active" (change)="toggle(s, $event.checked)" />
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
        @if (schools().length === 0 && loaded()) {
          <div class="empty-state">
            <mat-icon>domain</mat-icon>
            <div>No schools yet — onboard the first one.</div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .mono { font-family: monospace; font-size: 12px; }
  `,
})
export class SchoolsComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  schools = signal<School[]>([]);
  loaded = signal(false);
  columns = ['name', 'contact', 'users', 'status', 'created', 'active'];

  constructor() {
    this.reload();
  }

  reload() {
    this.api.schools().subscribe((res) => {
      this.schools.set(res.schools);
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
