import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Exam, SchoolClass, Subject, Term } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';
import { confirmDialog } from '../../shared/confirm-dialog';
import { LoadingBarComponent } from '../../shared/loading-bar';

const TERMS: { value: Term; label: string }[] = [
  { value: 'first', label: 'First term' },
  { value: 'second', label: 'Second term' },
  { value: 'third', label: 'Third term' },
];

/** Creating or editing an exam: the class, the term, and which subjects it covers. */
@Component({
  selector: 'app-exam-dialog',
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatCheckboxModule, MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.exam ? 'Edit exam' : 'New exam' }}</h2>
    <mat-dialog-content class="content">
      <div class="row">
        <mat-form-field appearance="outline">
          <mat-label>Class</mat-label>
          <mat-select [(ngModel)]="klass" [disabled]="!!data.exam">
            @for (c of data.classes; track c._id) {
              <mat-option [value]="c._id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Term</mat-label>
          <mat-select [(ngModel)]="term">
            @for (t of terms; track t.value) {
              <mat-option [value]="t.value">{{ t.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Session</mat-label>
          <input matInput [(ngModel)]="session" placeholder="2026/2027" />
        </mat-form-field>
      </div>

      <div class="section">Subjects and marks</div>
      @if (!data.subjects.length) {
        <div class="empty">Add subjects to the school before creating an exam.</div>
      }
      @for (s of data.subjects; track s._id) {
        <div class="subject">
          <mat-checkbox [checked]="picked.has(s._id)" (change)="pick(s._id, $event.checked)">
            {{ s.name }}
          </mat-checkbox>
          @if (picked.has(s._id)) {
            <mat-form-field appearance="outline" class="max" subscriptSizing="dynamic">
              <mat-label>Out of</mat-label>
              <input matInput type="number" min="1" max="1000"
                     [ngModel]="maxOf(s._id)" (ngModelChange)="setMax(s._id, $event)" />
            </mat-form-field>
          }
        </div>
      }
      @if (error) { <div class="error">{{ error }}</div> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancel</button>
      <button mat-flat-button color="primary" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 560px; padding-top: 8px; }
    .row { display: flex; gap: 12px; }
    .row mat-form-field { flex: 1; }
    .section { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: #90a4ae; margin: 6px 0 10px; }
    .subject { display: flex; align-items: center; gap: 16px; padding: 4px 0; }
    .subject mat-checkbox { flex: 1; }
    .max { width: 110px; }
    .empty { color: #78909c; font-size: 13px; padding: 8px 0 16px; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-top: 12px; font-size: 13px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamDialogComponent {
  terms = TERMS;
  klass = '';
  term: Term = 'first';
  session = '';
  picked = new Map<string, number>();
  error = '';

  constructor(
    public ref: MatDialogRef<ExamDialogComponent, unknown>,
    @Inject(MAT_DIALOG_DATA) public data: { exam: Exam | null; classes: SchoolClass[]; subjects: Subject[] }
  ) {
    const exam = data.exam;
    if (exam) {
      this.klass = exam.class._id;
      this.term = exam.term;
      this.session = exam.session;
      for (const s of exam.subjects) this.picked.set(s.subject._id, s.maxScore);
    } else {
      // Defaults to the session that has just started, which is right for
      // most of the year and one keystroke to change when it is not.
      const year = new Date().getFullYear();
      const month = new Date().getMonth();
      this.session = month >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
    }
  }

  maxOf(id: string) { return this.picked.get(id) ?? 100; }
  setMax(id: string, value: unknown) { this.picked.set(id, Number(value) || 100); }

  pick(id: string, on: boolean) {
    if (on) this.picked.set(id, 100);
    else this.picked.delete(id);
  }

  save() {
    this.error = '';
    if (!this.klass) { this.error = 'Choose a class.'; return; }
    if (!/^\d{4}\/\d{4}$/.test(this.session.trim())) { this.error = 'Session must look like 2026/2027.'; return; }
    if (!this.picked.size) { this.error = 'Choose at least one subject.'; return; }
    this.ref.close({
      class: this.klass,
      term: this.term,
      session: this.session.trim(),
      subjects: [...this.picked].map(([subject, maxScore]) => ({ subject, maxScore })),
    });
  }
}

@Component({
  selector: 'app-exams',
  imports: [
    DatePipe, RouterLink, MatButtonModule, MatIconModule, MatTableModule,
    MatMenuModule, MatTooltipModule, MatProgressBarModule, MatFormFieldModule,
    MatSelectModule, FormsModule,
    LoadingBarComponent,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Exams</h1>
          <div class="muted">Termly exams, result entry and publishing</div>
        </div>
        @if (canManage()) {
          <button mat-flat-button color="primary" (click)="edit(null)">
            <mat-icon>add</mat-icon> New exam
          </button>
        }
      </div>

      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label>Class</mat-label>
          <mat-select [(ngModel)]="classFilter" (selectionChange)="load()">
            <mat-option [value]="''">All classes</mat-option>
            @for (c of classes(); track c._id) {
              <mat-option [value]="c._id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="statusFilter" (selectionChange)="load()">
            <mat-option [value]="''">All</mat-option>
            <mat-option value="draft">Draft</mat-option>
            <mat-option value="open">Open</mat-option>
            <mat-option value="published">Published</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="table-card">
        <app-loading-bar [active]="loading()" />
        @if (!exams().length && loaded()) {
          <div class="empty-state">
            <mat-icon>fact_check</mat-icon>
            <div>{{ classFilter() || statusFilter() ? 'No exams match those filters.' : 'No exams yet.' }}</div>
          </div>
        } @else {
          <table mat-table [dataSource]="exams()">
            <ng-container matColumnDef="exam">
              <th mat-header-cell *matHeaderCellDef>Exam</th>
              <td mat-cell *matCellDef="let e">
                <a class="link" [routerLink]="['/exams', e._id]">{{ e.label }}</a>
                <div class="muted small">{{ e.subjects.length }} subject{{ e.subjects.length === 1 ? '' : 's' }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="class">
              <th mat-header-cell *matHeaderCellDef>Class</th>
              <td mat-cell *matCellDef="let e">{{ e.class?.name }}<div class="muted small">{{ e.roll }} on roll</div></td>
            </ng-container>
            <ng-container matColumnDef="progress">
              <th mat-header-cell *matHeaderCellDef>Results entered</th>
              <td mat-cell *matCellDef="let e">
                <div class="progress">
                  <mat-progress-bar mode="determinate" [value]="pct(e)" [color]="pct(e) === 100 ? 'primary' : 'accent'" />
                  <span class="muted small">{{ e.entered }} of {{ e.expected }}</span>
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let e">
                <span class="chip" [class]="e.status">{{ e.status }}</span>
                @if (e.publishedAt) {
                  <div class="muted small">{{ e.publishedAt | date: 'MMM d, y' }}</div>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let e">
                <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Exam actions">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item [routerLink]="['/exams', e._id]">
                    <mat-icon>edit_note</mat-icon> Enter results
                  </button>
                  @if (canManage()) {
                    @if (e.status === 'draft') {
                      <button mat-menu-item (click)="setStatus(e, 'open')">
                        <mat-icon>lock_open</mat-icon> Open for entry
                      </button>
                      <button mat-menu-item (click)="edit(e)"><mat-icon>edit</mat-icon> Edit</button>
                      <button mat-menu-item (click)="remove(e)"><mat-icon>delete</mat-icon> Delete</button>
                    }
                    @if (e.status === 'open') {
                      <button mat-menu-item (click)="edit(e)"><mat-icon>edit</mat-icon> Edit</button>
                      <button mat-menu-item (click)="publish(e)">
                        <mat-icon>send</mat-icon> Publish to guardians
                      </button>
                    }
                    @if (e.status === 'published') {
                      <button mat-menu-item (click)="setStatus(e, 'open')">
                        <mat-icon>lock_reset</mat-icon> Reopen for corrections
                      </button>
                    }
                  }
                </mat-menu>
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
    .page { padding: 24px 28px; max-width: 1180px; }
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .muted { color: #78909c; }
    .small { font-size: 12px; }
    .filters { display: flex; gap: 12px; margin-bottom: 14px; }
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .link { color: #1565c0; text-decoration: none; font-weight: 500; }
    .link:hover { text-decoration: underline; }
    .progress { display: flex; align-items: center; gap: 10px; min-width: 180px; }
    .progress mat-progress-bar { flex: 1; }
    .chip { border-radius: 12px; padding: 3px 11px; font-size: 12px; font-weight: 500; text-transform: capitalize; }
    .chip.draft { background: #eceff1; color: #546e7a; }
    .chip.open { background: #e3f2fd; color: #1565c0; }
    .chip.published { background: #e8f5e9; color: #2e7d32; }
    .empty-state { padding: 56px 20px; text-align: center; color: #90a4ae; }
    .empty-state mat-icon { font-size: 42px; width: 42px; height: 42px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamsComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);
  private router = inject(Router);

  exams = signal<Exam[]>([]);
  classes = signal<SchoolClass[]>([]);
  subjects = signal<Subject[]>([]);
  loaded = signal(false);
  loading = signal(false);
  classFilter = signal('');
  statusFilter = signal('');

  canManage = computed(() => this.auth.hasPerm('exams.manage'));
  columns = ['exam', 'class', 'progress', 'status', 'actions'];

  constructor() {
    this.api.classes().subscribe((r) => this.classes.set(r.classes));
    this.api.subjects().subscribe((r) => this.subjects.set(r.subjects.filter((s) => s.active)));
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.exams({ class: this.classFilter(), status: this.statusFilter() }).subscribe({
      next: (r) => { this.exams.set(r.exams); this.loaded.set(true); this.loading.set(false); },
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        this.loaded.set(true);
        this.loading.set(false);
      },
    });
  }

  pct(e: Exam) {
    return e.expected ? Math.round(((e.entered || 0) / e.expected) * 100) : 0;
  }

  edit(exam: Exam | null) {
    this.dialog
      .open(ExamDialogComponent, { data: { exam, classes: this.classes(), subjects: this.subjects() } })
      .afterClosed()
      .subscribe((body) => {
        if (!body) return;
        const req = exam ? this.api.updateExam(exam._id, body) : this.api.createExam(body);
        req.subscribe({
          next: () => { this.snack.open(exam ? 'Exam updated' : 'Exam created', 'OK', { duration: 3000 }); this.load(); },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 6000 }),
        });
      });
  }

  setStatus(exam: Exam, status: 'draft' | 'open' | 'published') {
    this.api.setExamStatus(exam._id, status).subscribe({
      next: () => { this.snack.open(`Exam is now ${status}`, 'OK', { duration: 3000 }); this.load(); },
      error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 6000 }),
    });
  }

  remove(exam: Exam) {
    confirmDialog(this.dialog, {
      title: 'Delete this exam?',
      message:
        `The ${exam.label} exam for ${exam.class?.name} will be deleted, together with ` +
        `every score entered against it. This cannot be undone.`,
      confirmLabel: 'Delete exam',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.deleteExam(exam._id).subscribe({
        next: () => { this.snack.open('Exam deleted', 'OK', { duration: 3000 }); this.load(); },
        error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 6000 }),
      });
    });
  }

  /** Publishing emails every guardian, so it is confirmed on the results page. */
  publish(exam: Exam) {
    this.router.navigate(['/exams', exam._id], { queryParams: { publish: 1 } });
  }
}
