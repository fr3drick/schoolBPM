import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { SchoolClass, Student, UserProfile } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';
import { confirmDialog } from '../../shared/confirm-dialog';
import { LoadingBarComponent } from '../../shared/loading-bar';

interface ClassDialogData {
  klass: SchoolClass | null;
  teachers: UserProfile[];
}

@Component({
  selector: 'app-class-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.klass ? 'Edit class' : 'Add class' }}</h2>
    <mat-dialog-content class="content">
      <mat-form-field appearance="outline">
        <mat-label>Class name</mat-label>
        <input matInput [(ngModel)]="name" placeholder="JSS1 A" />
      </mat-form-field>
      <div class="row2">
        <mat-form-field appearance="outline">
          <mat-label>Level (optional)</mat-label>
          <input matInput [(ngModel)]="level" placeholder="JSS1" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Academic year (optional)</mat-label>
          <input matInput [(ngModel)]="academicYear" placeholder="2026/2027" />
        </mat-form-field>
      </div>
      <mat-form-field appearance="outline">
        <mat-label>Form teacher (optional)</mat-label>
        <mat-select [(ngModel)]="formTeacher">
          <mat-option [value]="''">None</mat-option>
          @for (t of data.teachers; track t.id) {
            <mat-option [value]="t.id">{{ t.name }} — {{ t.role?.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!name.trim()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 440px; padding-top: 8px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassDialogComponent {
  name = '';
  level = '';
  academicYear = '';
  formTeacher = '';
  constructor(
    public ref: MatDialogRef<ClassDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ClassDialogData
  ) {
    const k = data.klass;
    if (!k) return;
    this.name = k.name;
    this.level = k.level || '';
    this.academicYear = k.academicYear || '';
    const ft = k.formTeacher;
    this.formTeacher = typeof ft === 'object' && ft ? (ft.id || ft._id || '') : (ft as string) || '';
  }
  save() {
    this.ref.close({
      name: this.name.trim(),
      level: this.level.trim(),
      academicYear: this.academicYear.trim(),
      formTeacher: this.formTeacher || null,
    });
  }
}

/** Assigns unassigned students into a class in one go, for a new intake. */
@Component({
  selector: 'app-assign-students-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Assign students to {{ data.klass.name }}</h2>
    <mat-dialog-content class="content">
      @if (!data.students.length) {
        <p class="muted">Every student already belongs to a class.</p>
      } @else {
        <mat-form-field appearance="outline" class="filter">
          <mat-label>Filter</mat-label>
          <input matInput [(ngModel)]="filter" />
        </mat-form-field>
        <div class="list">
          @for (s of visible(); track s._id) {
            <mat-checkbox [checked]="selected.has(s._id)" (change)="toggle(s._id, $event.checked)">
              {{ s.lastName }}, {{ s.firstName }}
              <span class="muted">— {{ s.admissionNumber }}</span>
            </mat-checkbox>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!selected.size" (click)="confirm()">
        Assign {{ selected.size }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 460px; padding-top: 8px; }
    .filter { width: 100%; }
    .list { display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow: auto; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignStudentsDialogComponent {
  filter = '';
  selected = new Set<string>();
  constructor(
    public ref: MatDialogRef<AssignStudentsDialogComponent, string[]>,
    @Inject(MAT_DIALOG_DATA) public data: { klass: SchoolClass; students: Student[] }
  ) {}
  visible(): Student[] {
    const q = this.filter.trim().toLowerCase();
    if (!q) return this.data.students;
    return this.data.students.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.admissionNumber}`.toLowerCase().includes(q)
    );
  }
  toggle(id: string, on: boolean) {
    if (on) this.selected.add(id);
    else this.selected.delete(id);
  }
  // Angular templates have no spread syntax, so the set is materialised here.
  confirm() {
    this.ref.close([...this.selected]);
  }
}

@Component({
  selector: 'app-classes',
  imports: [MatTableModule, MatIconModule, MatButtonModule, MatDialogModule, LoadingBarComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Classes</h1>
        <span class="spacer"></span>
        @if (canManage()) {
          <button mat-flat-button color="primary" (click)="edit(null)">
            <mat-icon>add</mat-icon> Add class
          </button>
        }
      </div>

      <div class="table-card">
        <app-loading-bar [active]="loading()" />
        @if (!classes().length && loaded()) {
          <div class="empty-state">
            <mat-icon>groups</mat-icon>
            <div>No classes yet — add one, then assign students to it.</div>
          </div>
        } @else {
          <table mat-table [dataSource]="classes()">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Class</th>
              <td mat-cell *matCellDef="let c">
                <b>{{ c.name }}</b>
                <div class="muted small">{{ c.level }}{{ c.level && c.academicYear ? ' · ' : '' }}{{ c.academicYear }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="formTeacher">
              <th mat-header-cell *matHeaderCellDef>Form teacher</th>
              <td mat-cell *matCellDef="let c">{{ c.formTeacher?.name || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="students">
              <th mat-header-cell *matHeaderCellDef>Students</th>
              <td mat-cell *matCellDef="let c">{{ c.studentCount }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let c" class="actions-cell">
                @if (canManage()) {
                  <button mat-stroked-button (click)="assign(c)">
                    <mat-icon>group_add</mat-icon> Assign students
                  </button>
                  <button mat-icon-button (click)="edit(c)"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button (click)="remove(c)"><mat-icon>delete</mat-icon></button>
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
    .small { font-size: 12px; }
    .actions-cell { text-align: right; white-space: nowrap; }
    .actions-cell button { margin-left: 4px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassesComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  classes = signal<SchoolClass[]>([]);
  teachers = signal<UserProfile[]>([]);
  loaded = signal(false);
  loading = signal(false);
  canManage = computed(() => this.auth.hasPerm('classes.manage'));
  columns = ['name', 'formTeacher', 'students', 'actions'];

  constructor() {
    this.load();
    // Only users.manage holders can list users; a form teacher is optional,
    // so an empty list is a normal outcome rather than an error to surface.
    this.api.users().subscribe({
      next: (res) => this.teachers.set(res.users.filter((u) => u.active)),
      error: () => this.teachers.set([]),
    });
  }

  load() {
    this.loading.set(true);
    this.api.classes().subscribe({
      next: (res) => { this.classes.set(res.classes); this.loaded.set(true); this.loading.set(false); },
      error: () => { this.loaded.set(true); this.loading.set(false); },
    });
  }

  edit(klass: SchoolClass | null) {
    this.dialog
      .open(ClassDialogComponent, { data: { klass, teachers: this.teachers() } })
      .afterClosed()
      .subscribe((body) => {
        if (!body) return;
        const req = klass ? this.api.updateClass(klass._id, body) : this.api.createClass(body);
        req.subscribe({
          next: () => { this.snack.open('Saved', 'OK', { duration: 2500 }); this.load(); },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
        });
      });
  }

  assign(klass: SchoolClass) {
    // Only students without a class, so this cannot silently move someone
    // out of a class they already belong to.
    this.api.students({ status: 'active' }).subscribe((res) => {
      const unassigned = res.students.filter((s) => !s.class);
      this.dialog
        .open(AssignStudentsDialogComponent, { data: { klass, students: unassigned } })
        .afterClosed()
        .subscribe((ids) => {
          if (!ids?.length) return;
          this.api.assignStudentsToClass(klass._id, ids).subscribe({
            next: (r) => {
              this.snack.open(`${r.assigned} student(s) assigned to ${klass.name}`, 'OK', { duration: 3500 });
              this.load();
            },
            error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
          });
        });
    });
  }

  remove(klass: SchoolClass) {
    confirmDialog(this.dialog, {
      title: 'Delete this class?',
      message:
        `"${klass.name}" will be removed. Students in it are not deleted, but they ` +
        `become unassigned and will need putting into another class.`,
      confirmLabel: 'Delete class',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.deleteClass(klass._id).subscribe({
        next: () => this.load(),
        error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
      });
    });
  }
}
