import { Component, Inject, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Subject } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';

@Component({
  selector: 'app-subject-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data ? 'Edit subject' : 'Add subject' }}</h2>
    <mat-dialog-content class="content">
      <mat-form-field appearance="outline">
        <mat-label>Subject name</mat-label>
        <input matInput [(ngModel)]="name" placeholder="Mathematics" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Short code (optional)</mat-label>
        <input matInput [(ngModel)]="code" placeholder="MTH" maxlength="10" />
        <mat-hint>Used where space is tight, such as result sheets</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="name.trim().length < 2" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `.content { display: flex; flex-direction: column; min-width: 380px; padding-top: 8px; }`,
})
export class SubjectDialogComponent {
  name = '';
  code = '';
  constructor(
    public ref: MatDialogRef<SubjectDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Subject | null
  ) {
    if (data) {
      this.name = data.name;
      this.code = data.code || '';
    }
  }
  save() {
    this.ref.close({ name: this.name.trim(), code: this.code.trim().toUpperCase() });
  }
}

@Component({
  selector: 'app-subjects',
  imports: [
    MatTableModule, MatIconModule, MatButtonModule, MatSlideToggleModule, MatDialogModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Subjects</h1>
        <span class="muted">Taught across the school</span>
        <span class="spacer"></span>
        @if (canManage()) {
          <button mat-flat-button color="primary" (click)="edit(null)">
            <mat-icon>add</mat-icon> Add subject
          </button>
        }
      </div>

      <div class="table-card">
        @if (!subjects().length && loaded()) {
          <div class="empty-state">
            <mat-icon>menu_book</mat-icon>
            <div>No subjects yet.</div>
          </div>
        } @else {
          <table mat-table [dataSource]="subjects()">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Subject</th>
              <td mat-cell *matCellDef="let s"><b>{{ s.name }}</b></td>
            </ng-container>
            <ng-container matColumnDef="code">
              <th mat-header-cell *matHeaderCellDef>Code</th>
              <td mat-cell *matCellDef="let s" class="mono">{{ s.code || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="active">
              <th mat-header-cell *matHeaderCellDef>Active</th>
              <td mat-cell *matCellDef="let s">
                <mat-slide-toggle [checked]="s.active" [disabled]="!canManage()"
                                  (change)="toggle(s, $event.checked)" />
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let s" class="actions-cell">
                @if (canManage()) {
                  <button mat-icon-button (click)="edit(s)"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button (click)="remove(s)"><mat-icon>delete</mat-icon></button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        }
      </div>
    </div>
  `,
  styles: `
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .mono { font-family: monospace; }
    .actions-cell { text-align: right; white-space: nowrap; }
  `,
})
export class SubjectsComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  subjects = signal<Subject[]>([]);
  loaded = signal(false);
  canManage = computed(() => this.auth.hasPerm('subjects.manage'));
  columns = ['name', 'code', 'active', 'actions'];

  constructor() { this.load(); }

  load() {
    this.api.subjects().subscribe({
      next: (res) => { this.subjects.set(res.subjects); this.loaded.set(true); },
      error: () => this.loaded.set(true),
    });
  }

  edit(subject: Subject | null) {
    this.dialog.open(SubjectDialogComponent, { data: subject }).afterClosed().subscribe((body) => {
      if (!body) return;
      const req = subject ? this.api.updateSubject(subject._id, body) : this.api.createSubject(body);
      req.subscribe({
        next: () => { this.snack.open('Saved', 'OK', { duration: 2500 }); this.load(); },
        error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
      });
    });
  }

  toggle(subject: Subject, active: boolean) {
    this.api.updateSubject(subject._id, { name: subject.name, code: subject.code, active }).subscribe({
      next: () => this.load(),
      error: (err) => { this.snack.open(errorMessage(err), 'OK', { duration: 4000 }); this.load(); },
    });
  }

  remove(subject: Subject) {
    if (!confirm(`Delete the subject "${subject.name}"?`)) return;
    this.api.deleteSubject(subject._id).subscribe({
      next: () => this.load(),
      error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
    });
  }
}
