import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AttendanceStatus, AttendanceSummaryRow, RegisterRecord, SchoolClass } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';

const STATUSES: { value: AttendanceStatus; label: string; icon: string }[] = [
  { value: 'present', label: 'Present', icon: 'check' },
  { value: 'late', label: 'Late', icon: 'schedule' },
  { value: 'absent', label: 'Absent', icon: 'close' },
  { value: 'excused', label: 'Excused', icon: 'event_busy' },
];

@Component({
  selector: 'app-attendance',
  imports: [
    DatePipe, FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatNativeDateModule, MatTabsModule, MatTableModule, MatTooltipModule,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Attendance</h1>
          <div class="muted">Daily register and attendance rates</div>
        </div>
      </div>

      <mat-tab-group [(selectedIndex)]="tab" animationDuration="0ms">
        <mat-tab label="Register">
          <div class="tab-body">
            <div class="filters">
              <mat-form-field appearance="outline">
                <mat-label>Class</mat-label>
                <mat-select [(ngModel)]="klass" (selectionChange)="loadRegister()">
                  @for (c of classes(); track c._id) {
                    <mat-option [value]="c._id">{{ c.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Date</mat-label>
                <input matInput [matDatepicker]="picker" [max]="today" [(ngModel)]="date"
                       (dateChange)="loadRegister()" />
                <mat-datepicker-toggle matIconSuffix [for]="picker" />
                <mat-datepicker #picker />
              </mat-form-field>
              <span class="spacer"></span>
              @if (records().length && canTake()) {
                <button mat-stroked-button (click)="markAll('present')">Mark all present</button>
                <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
                  <mat-icon>save</mat-icon> Save register
                </button>
              }
            </div>

            @if (taken()) {
              <div class="banner">
                <mat-icon>check_circle</mat-icon>
                <div>Register taken {{ takenAt() | date: 'MMM d, y · h:mm a' }}. Saving again will replace it.</div>
              </div>
            }

            <div class="table-card">
              @if (!records().length) {
                <div class="empty-state">
                  <mat-icon>how_to_reg</mat-icon>
                  <div>{{ klass() ? 'No active students in this class.' : 'Choose a class to take the register.' }}</div>
                </div>
              } @else {
                <table class="register">
                  <tbody>
                    @for (r of records(); track r.student; let i = $index) {
                      <tr [class.flagged]="r.status !== 'present'">
                        <td class="name">
                          <div>{{ r.name }}</div>
                          <div class="muted small">{{ r.admissionNumber }}</div>
                        </td>
                        <td class="marks">
                          <mat-button-toggle-group [value]="r.status" [disabled]="!canTake()"
                                                   (change)="setStatus(i, $event.value)" hideSingleSelectionIndicator>
                            @for (s of statuses; track s.value) {
                              <mat-button-toggle [value]="s.value" [matTooltip]="s.label">
                                <mat-icon>{{ s.icon }}</mat-icon>
                              </mat-button-toggle>
                            }
                          </mat-button-toggle-group>
                        </td>
                        <td class="note">
                          @if (r.status !== 'present') {
                            <input class="note-input" placeholder="Reason (optional)"
                                   [disabled]="!canTake()"
                                   [ngModel]="r.note" (ngModelChange)="setNote(i, $event)" />
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <div class="tally">
                  @for (s of statuses; track s.value) {
                    <span class="pill {{ s.value }}">{{ countOf(s.value) }} {{ s.label.toLowerCase() }}</span>
                  }
                </div>
              }
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Attendance rates">
          <div class="tab-body">
            <div class="filters">
              <mat-form-field appearance="outline">
                <mat-label>Class</mat-label>
                <mat-select [(ngModel)]="summaryClass" (selectionChange)="loadSummary()">
                  <mat-option [value]="''">All classes</mat-option>
                  @for (c of classes(); track c._id) {
                    <mat-option [value]="c._id">{{ c.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
            <div class="table-card">
              @if (!summary().length) {
                <div class="empty-state">
                  <mat-icon>insights</mat-icon>
                  <div>No registers have been taken yet.</div>
                </div>
              } @else {
                <table mat-table [dataSource]="summary()">
                  <ng-container matColumnDef="name">
                    <th mat-header-cell *matHeaderCellDef>Student</th>
                    <td mat-cell *matCellDef="let r">
                      <div>{{ r.name }}</div>
                      <div class="muted small">{{ r.admissionNumber }}</div>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="rate">
                    <th mat-header-cell *matHeaderCellDef>Rate</th>
                    <td mat-cell *matCellDef="let r">
                      <span class="rate" [class.low]="r.rate < 85">{{ r.rate }}%</span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="present">
                    <th mat-header-cell *matHeaderCellDef>Present</th>
                    <td mat-cell *matCellDef="let r">{{ r.present }}</td>
                  </ng-container>
                  <ng-container matColumnDef="late">
                    <th mat-header-cell *matHeaderCellDef>Late</th>
                    <td mat-cell *matCellDef="let r">{{ r.late }}</td>
                  </ng-container>
                  <ng-container matColumnDef="absent">
                    <th mat-header-cell *matHeaderCellDef>Absent</th>
                    <td mat-cell *matCellDef="let r">{{ r.absent }}</td>
                  </ng-container>
                  <ng-container matColumnDef="excused">
                    <th mat-header-cell *matHeaderCellDef>Excused</th>
                    <td mat-cell *matCellDef="let r">{{ r.excused }}</td>
                  </ng-container>
                  <ng-container matColumnDef="sessions">
                    <th mat-header-cell *matHeaderCellDef>Days</th>
                    <td mat-cell *matCellDef="let r">{{ r.sessions }}</td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="summaryColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: summaryColumns"></tr>
                </table>
              }
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .page { padding: 24px 28px; max-width: 1080px; }
    .page-head { margin-bottom: 10px; }
    h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .muted { color: #78909c; }
    .small { font-size: 12px; }
    .tab-body { padding-top: 18px; }
    .filters { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; }
    .spacer { flex: 1 1 auto; }
    .banner {
      display: flex; gap: 12px; align-items: center; background: #f1f8f3;
      border: 1px solid #c8e6c9; border-radius: 8px; padding: 11px 16px;
      margin-bottom: 14px; color: #2e7d32; font-size: 13px;
    }
    .table-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.12); overflow: hidden; }
    .register { width: 100%; border-collapse: collapse; }
    .register td { padding: 8px 16px; border-bottom: 1px solid #eceff1; }
    .register tr.flagged { background: #fffdf5; }
    .name { min-width: 220px; }
    .marks { width: 220px; }
    .note { width: 40%; }
    .note-input {
      width: 100%; padding: 7px 10px; font-size: 13px; font-family: inherit;
      border: 1px solid #dfe4e8; border-radius: 6px;
    }
    .note-input:focus { outline: none; border-color: #1565c0; }
    .tally { display: flex; gap: 8px; padding: 14px 16px; border-top: 1px solid #eceff1; background: #fafbfc; }
    .pill { border-radius: 12px; padding: 3px 12px; font-size: 12px; font-weight: 500; }
    .pill.present { background: #e8f5e9; color: #2e7d32; }
    .pill.late { background: #fff8e1; color: #8a6100; }
    .pill.absent { background: #ffebee; color: #c62828; }
    .pill.excused { background: #eceff1; color: #546e7a; }
    .rate { font-weight: 600; color: #2e7d32; }
    .rate.low { color: #c62828; }
    .empty-state { padding: 56px 20px; text-align: center; color: #90a4ae; }
    .empty-state mat-icon { font-size: 42px; width: 42px; height: 42px; }
  `,
})
export class AttendanceComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  statuses = STATUSES;
  today = new Date();
  tab = 0;

  classes = signal<SchoolClass[]>([]);
  records = signal<RegisterRecord[]>([]);
  summary = signal<AttendanceSummaryRow[]>([]);
  taken = signal(false);
  takenAt = signal<string | null>(null);
  saving = signal(false);

  klass = signal('');
  date = signal(new Date());
  summaryClass = signal('');

  canTake = computed(() => this.auth.hasPerm('attendance.take'));
  summaryColumns = ['name', 'rate', 'present', 'late', 'absent', 'excused', 'sessions'];

  constructor() {
    this.api.classes().subscribe((r) => {
      this.classes.set(r.classes);
      if (r.classes.length) {
        this.klass.set(r.classes[0]._id);
        this.loadRegister();
      }
    });
    this.loadSummary();
  }

  /**
   * Sent as a plain calendar date.
   *
   * toISOString() would convert to UTC first, which in a zone ahead of it
   * turns "the 3rd" into "the 2nd" for any register taken before the offset
   * — a register filed against the wrong day.
   */
  private dateParam(): string {
    const d = this.date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  loadRegister() {
    if (!this.klass()) return;
    this.api.register(this.klass(), this.dateParam()).subscribe({
      next: (r) => {
        this.records.set(r.records);
        this.taken.set(r.taken);
        this.takenAt.set(r.takenAt);
      },
      error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
    });
  }

  loadSummary() {
    this.api.attendanceSummary({ class: this.summaryClass() }).subscribe({
      next: (r) => this.summary.set(r.summary),
      error: () => this.summary.set([]),
    });
  }

  countOf(status: AttendanceStatus) {
    return this.records().filter((r) => r.status === status).length;
  }

  setStatus(index: number, status: AttendanceStatus) {
    const next = [...this.records()];
    // Clearing the note with the flag: a reason left behind after someone is
    // marked present again would be shown against the wrong state.
    next[index] = { ...next[index], status, note: status === 'present' ? '' : next[index].note };
    this.records.set(next);
  }

  setNote(index: number, note: string) {
    const next = [...this.records()];
    next[index] = { ...next[index], note };
    this.records.set(next);
  }

  markAll(status: AttendanceStatus) {
    this.records.set(this.records().map((r) => ({ ...r, status, note: '' })));
  }

  save() {
    this.saving.set(true);
    const records = this.records().map((r) => ({ student: r.student, status: r.status, note: r.note }));
    this.api.saveRegister(this.klass(), this.dateParam(), records).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('Register saved', 'OK', { duration: 3000 });
        this.loadRegister();
        this.loadSummary();
      },
      error: (err) => {
        this.saving.set(false);
        this.snack.open(errorMessage(err), 'OK', { duration: 6000 });
      },
    });
  }
}
