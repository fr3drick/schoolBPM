import { ChangeDetectionStrategy, Component, DestroyRef, Inject, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject as RxSubject, debounceTime } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Guardian, SchoolClass, Student } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';
import { confirmDialog } from '../../shared/confirm-dialog';
import { StudentImportComponent } from './student-import';

interface StudentDialogData {
  student: Student | null;
  classes: SchoolClass[];
}

@Component({
  selector: 'app-student-dialog',
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.student ? 'Edit student' : 'Add student' }}</h2>
    <mat-dialog-content class="content">
      <div class="section">Student</div>
      <div class="row2">
        <mat-form-field appearance="outline">
          <mat-label>Admission number</mat-label>
          <input matInput [(ngModel)]="admissionNumber" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Class</mat-label>
          <mat-select [(ngModel)]="klass">
            <mat-option [value]="''">Not assigned</mat-option>
            @for (c of data.classes; track c._id) {
              <mat-option [value]="c._id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <div class="row2">
        <mat-form-field appearance="outline">
          <mat-label>First name</mat-label>
          <input matInput [(ngModel)]="firstName" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Last name</mat-label>
          <input matInput [(ngModel)]="lastName" />
        </mat-form-field>
      </div>
      <div class="row2">
        <mat-form-field appearance="outline">
          <mat-label>Other names</mat-label>
          <input matInput [(ngModel)]="otherNames" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Date of birth</mat-label>
          <input matInput type="date" [(ngModel)]="dateOfBirth" />
        </mat-form-field>
      </div>
      <div class="row2">
        <mat-form-field appearance="outline">
          <mat-label>Gender</mat-label>
          <mat-select [(ngModel)]="gender">
            <mat-option [value]="''">Not stated</mat-option>
            <mat-option value="female">Female</mat-option>
            <mat-option value="male">Male</mat-option>
            <mat-option value="other">Other</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="status">
            <mat-option value="active">Active</mat-option>
            <mat-option value="graduated">Graduated</mat-option>
            <mat-option value="withdrawn">Withdrawn</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div class="section">
        Parents / guardians
        <span class="muted">— results are emailed to these addresses</span>
      </div>
      @for (g of guardians; track $index; let i = $index) {
        <div class="guardian">
          <div class="row2">
            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="g.name" [name]="'gname' + i" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Relationship</mat-label>
              <input matInput [(ngModel)]="g.relationship" [name]="'grel' + i" placeholder="Mother" />
            </mat-form-field>
          </div>
          <div class="row2">
            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput type="email" [(ngModel)]="g.email" [name]="'gmail' + i" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Phone</mat-label>
              <input matInput [(ngModel)]="g.phone" [name]="'gphone' + i" />
            </mat-form-field>
          </div>
          <div class="guardian-actions">
            @if (guardians.length > 1) {
              <button mat-button color="warn" type="button" (click)="removeGuardian(i)">
                <mat-icon>close</mat-icon> Remove
              </button>
            }
          </div>
        </div>
      }
      <button mat-stroked-button type="button" (click)="addGuardian()" class="add-guardian">
        <mat-icon>add</mat-icon> Add another guardian
      </button>

      @if (error) { <div class="error">{{ error }}</div> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!valid()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    /* Sized, not pinned: 560px on a laptop, but a 360px phone gets the width
       it has rather than a dialog that scrolls sideways. */
    .content { display: flex; flex-direction: column; width: 560px; max-width: 100%; padding-top: 8px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 599px) { .row2 { grid-template-columns: 1fr; gap: 0; } }
    .section {
      font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px;
      color: #90a4ae; margin: 8px 0 10px;
    }
    .section .muted { text-transform: none; letter-spacing: 0; font-weight: 400; }
    .guardian { border: 1px solid #e3e7ea; border-radius: 8px; padding: 12px 12px 0; margin-bottom: 10px; }
    .guardian-actions { display: flex; justify-content: flex-end; margin-top: -12px; }
    .add-guardian { align-self: flex-start; margin-bottom: 8px; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; font-size: 13px; }
  `,
})
export class StudentDialogComponent {
  admissionNumber = '';
  firstName = '';
  lastName = '';
  otherNames = '';
  dateOfBirth = '';
  gender = '';
  status = 'active';
  klass = '';
  guardians: Guardian[] = [{ name: '', relationship: '', email: '', phone: '' }];
  error = '';

  constructor(
    public ref: MatDialogRef<StudentDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: StudentDialogData
  ) {
    const s = data.student;
    if (!s) return;
    this.admissionNumber = s.admissionNumber;
    this.firstName = s.firstName;
    this.lastName = s.lastName;
    this.otherNames = s.otherNames || '';
    this.dateOfBirth = s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : '';
    this.gender = s.gender || '';
    this.status = s.status;
    this.klass = typeof s.class === 'object' && s.class ? s.class._id : (s.class as string) || '';
    this.guardians = s.guardians?.length
      ? s.guardians.map((g) => ({ ...g }))
      : [{ name: '', relationship: '', email: '', phone: '' }];
  }

  addGuardian() {
    this.guardians = [...this.guardians, { name: '', relationship: '', email: '', phone: '' }];
  }
  removeGuardian(i: number) {
    this.guardians = this.guardians.filter((_, idx) => idx !== i);
  }

  valid(): boolean {
    return !!this.admissionNumber.trim() && !!this.firstName.trim() && !!this.lastName.trim();
  }

  save() {
    // Guardians with nothing filled in are dropped rather than rejected —
    // the blank row is just the form's starting state, not user intent.
    const guardians = this.guardians.filter((g) => g.name?.trim() || g.email?.trim() || g.phone?.trim());
    const withoutName = guardians.find((g) => !g.name?.trim());
    if (withoutName) {
      this.error = 'A guardian with contact details also needs a name.';
      return;
    }
    this.ref.close({
      admissionNumber: this.admissionNumber.trim(),
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      otherNames: this.otherNames.trim(),
      dateOfBirth: this.dateOfBirth || null,
      gender: this.gender,
      status: this.status,
      class: this.klass || null,
      guardians,
    });
  }
}

@Component({
  selector: 'app-students',
  imports: [
    DatePipe, FormsModule, MatTableModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatMenuModule,
    MatTooltipModule, MatDialogModule, MatPaginatorModule, MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Students</h1>
        <span class="muted">{{ countLabel() }}</span>
        <span class="spacer"></span>
        @if (canManage()) {
          <button mat-stroked-button (click)="importCsv()">
            <mat-icon>upload_file</mat-icon> Import CSV
          </button>
          <button mat-flat-button color="primary" (click)="edit(null)">
            <mat-icon>person_add</mat-icon> Add student
          </button>
        }
      </div>

      <!-- One interaction model for the whole bar: everything applies as you
           change it, the text box after a short pause. There used to be three
           (Enter, selection-change, and an Apply button that was the only way
           to make the search box take effect with the mouse). -->
      <div class="filters">
        <mat-form-field appearance="outline" class="search">
          <mat-label>Search name or admission number</mat-label>
          <input matInput [ngModel]="query()" (ngModelChange)="setQuery($event)" />
          @if (query()) {
            <button matSuffix mat-icon-button aria-label="Clear search" (click)="setQuery('')">
              <mat-icon>close</mat-icon>
            </button>
          } @else {
            <mat-icon matSuffix>search</mat-icon>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Class</mat-label>
          <mat-select [ngModel]="classFilter()" (ngModelChange)="setClassFilter($event)">
            <mat-option [value]="''">All classes</mat-option>
            @for (c of classes(); track c._id) {
              <mat-option [value]="c._id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [ngModel]="statusFilter()" (ngModelChange)="setStatusFilter($event)">
            <mat-option [value]="''">All</mat-option>
            <mat-option value="active">Active</mat-option>
            <mat-option value="graduated">Graduated</mat-option>
            <mat-option value="withdrawn">Withdrawn</mat-option>
          </mat-select>
        </mat-form-field>
        @if (filtered()) {
          <button mat-button (click)="clearFilters()">
            <mat-icon>filter_alt_off</mat-icon> Clear
          </button>
        }
      </div>

      <div class="table-card">
        <!-- Reserves its own height so the table does not jump when the bar
             appears on a filter change. -->
        <div class="loading-slot">
          @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        </div>
        @if (!loaded()) {
          <div class="empty-state">
            <mat-icon>hourglass_empty</mat-icon>
            <div>Loading students…</div>
          </div>
        } @else if (!students().length) {
          <div class="empty-state">
            <mat-icon>school</mat-icon>
            <div>{{ filtered() ? 'No students match those filters.' : 'No students yet — add one or import a CSV.' }}</div>
            @if (filtered()) {
              <button mat-button (click)="clearFilters()">Clear filters</button>
            }
          </div>
        } @else {
          <table mat-table [dataSource]="students()">
            <ng-container matColumnDef="admissionNumber">
              <th mat-header-cell *matHeaderCellDef>Admission no.</th>
              <td mat-cell *matCellDef="let s" class="mono">{{ s.admissionNumber }}</td>
            </ng-container>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let s">
                <b>{{ s.lastName }}, {{ s.firstName }}</b>
                <div class="muted small">{{ s.otherNames }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="class">
              <th mat-header-cell *matHeaderCellDef>Class</th>
              <td mat-cell *matCellDef="let s">{{ s.class?.name || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="guardian">
              <th mat-header-cell *matHeaderCellDef>Guardian contact</th>
              <td mat-cell *matCellDef="let s">
                @if (primary(s); as g) {
                  <div>{{ g.name }}</div>
                  <div class="muted small">{{ g.email || g.phone || 'no contact' }}</div>
                } @else {
                  <span class="muted warn" matTooltip="Results cannot be emailed without a guardian address">
                    <mat-icon inline>warning</mat-icon> none
                  </span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let s">
                <span class="status-chip" [class]="chip(s.status)">{{ s.status }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="created">
              <th mat-header-cell *matHeaderCellDef>Added</th>
              <td mat-cell *matCellDef="let s" class="nowrap">{{ s.createdAt | date: 'MMM d, y' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let s" class="actions-cell">
                @if (canManage()) {
                  <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="Student actions">
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #menu="matMenu">
                    <button mat-menu-item (click)="edit(s)"><mat-icon>edit</mat-icon> Edit</button>
                    <button mat-menu-item (click)="remove(s)"><mat-icon>delete</mat-icon> Delete</button>
                  </mat-menu>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        }
        <!-- Always rendered once loaded, even on a single page: it is the only
             thing on screen that says how many students there are in total,
             and its absence is what made 200-of-900 look like all of them. -->
        @if (loaded() && total()) {
          <mat-paginator
            [length]="total()"
            [pageSize]="pageSize()"
            [pageIndex]="pageIndex()"
            [pageSizeOptions]="[25, 50, 100, 200]"
            (page)="onPage($event)"
            aria-label="Select page of students"
          />
        }
      </div>
    </div>
  `,
  styles: `
    .filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
    .search { min-width: 300px; flex: 1 1 300px; }
    .loading-slot { height: 4px; }
    .table-card { position: relative; }
    @media (max-width: 599px) {
      .search { min-width: 0; }
      .filters mat-form-field { flex: 1 1 100%; }
      /* Six columns do not fit a phone; let the table scroll inside its card
         rather than the page scrolling sideways. */
      .table-card table { min-width: 720px; }
      .table-card { overflow-x: auto; }
    }
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .mono { font-family: monospace; }
    .small { font-size: 12px; }
    .nowrap { white-space: nowrap; }
    .warn { color: #b26a00; }
    .warn mat-icon { font-size: 15px; width: 15px; height: 15px; vertical-align: -2px; }
    .actions-cell { text-align: right; }
    .status-chip.active { background: #e8f5e9; color: #2e7d32; }
    .status-chip.graduated { background: #e3f2fd; color: #1565c0; }
    .status-chip.withdrawn { background: #eceff1; color: #546e7a; }
  `,
})
export class StudentsComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  private destroyRef = inject(DestroyRef);

  students = signal<Student[]>([]);
  classes = signal<SchoolClass[]>([]);
  total = signal(0);
  loaded = signal(false);
  loading = signal(false);
  query = signal('');
  classFilter = signal('');
  statusFilter = signal('');
  pageIndex = signal(0);
  pageSize = signal(50);

  canManage = computed(() => this.auth.hasPerm('students.manage'));
  filtered = computed(() => !!(this.query() || this.classFilter() || this.statusFilter()));
  columns = ['admissionNumber', 'name', 'class', 'guardian', 'status', 'created', 'actions'];

  /** "Showing 51–100 of 912" — the count the page never used to admit to. */
  countLabel = computed(() => {
    const total = this.total();
    if (!this.loaded()) return '';
    if (!total) return this.filtered() ? 'no matches' : 'none on roll';
    const first = this.pageIndex() * this.pageSize() + 1;
    const last = Math.min(first + this.students().length - 1, total);
    const scope = this.filtered() ? 'matching' : 'on roll';
    if (total <= this.pageSize() && this.pageIndex() === 0) return `${total} ${scope}`;
    return `showing ${first}–${last} of ${total} ${scope}`;
  });

  /** Typing debounces; picking from a select does not. Both end at `load()`. */
  private typed = new RxSubject<void>();

  constructor() {
    this.api.classes().subscribe((res) => this.classes.set(res.classes));
    this.typed
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
    this.load();
  }

  setQuery(value: string) {
    this.query.set(value);
    this.pageIndex.set(0);
    this.typed.next();
  }

  setClassFilter(value: string) {
    this.classFilter.set(value);
    this.pageIndex.set(0);
    this.load();
  }

  setStatusFilter(value: string) {
    this.statusFilter.set(value);
    this.pageIndex.set(0);
    this.load();
  }

  clearFilters() {
    this.query.set('');
    this.classFilter.set('');
    this.statusFilter.set('');
    this.pageIndex.set(0);
    this.load();
  }

  onPage(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .students({
        q: this.query(),
        class: this.classFilter(),
        status: this.statusFilter(),
        skip: this.pageIndex() * this.pageSize(),
        limit: this.pageSize(),
      })
      .subscribe({
        next: (res) => {
          this.students.set(res.students);
          this.total.set(res.total);
          // A delete can empty the last page. Step back rather than showing an
          // empty table under a paginator that says there are results.
          if (!res.students.length && res.total && this.pageIndex() > 0) {
            this.pageIndex.set(Math.max(0, Math.ceil(res.total / this.pageSize()) - 1));
            this.load();
            return;
          }
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: (err) => {
          this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
          this.loaded.set(true);
          this.loading.set(false);
        },
      });
  }

  primary(s: Student): Guardian | null {
    return s.guardians?.find((g) => g.isPrimary) || s.guardians?.[0] || null;
  }

  chip(status: string): string {
    return status;
  }

  edit(student: Student | null) {
    this.dialog
      .open(StudentDialogComponent, { data: { student, classes: this.classes() }, maxWidth: '95vw' })
      .afterClosed()
      .subscribe((body) => {
        if (!body) return;
        const req = student ? this.api.updateStudent(student._id, body) : this.api.createStudent(body);
        req.subscribe({
          next: () => {
            this.snack.open(student ? 'Student updated' : 'Student added', 'OK', { duration: 3000 });
            this.load();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
        });
      });
  }

  importCsv() {
    this.dialog
      .open(StudentImportComponent, { width: '880px', maxWidth: '95vw', data: { classes: this.classes() } })
      .afterClosed()
      .subscribe((changed) => {
        if (changed) this.load();
      });
  }

  remove(student: Student) {
    confirmDialog(this.dialog, {
      title: 'Delete this student?',
      message:
        `${student.firstName} ${student.lastName} (${student.admissionNumber}) will be removed ` +
        `from the roll. Their exam results and attendance records are not deleted.`,
      confirmLabel: 'Delete student',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.deleteStudent(student._id).subscribe({
        next: () => {
          this.snack.open('Student deleted', 'OK', { duration: 3000 });
          this.load();
        },
        error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
      });
    });
  }
}
