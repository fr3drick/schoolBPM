import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { DownloadService } from '../../core/download.service';
import { Exam, ReportCardRow } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';
import { LoadingBarComponent } from '../../shared/loading-bar';

@Component({
  selector: 'app-reports',
  imports: [
    FormsModule, MatButtonModule, MatIconModule, MatTableModule,
    MatFormFieldModule, MatSelectModule, MatTooltipModule, LoadingBarComponent,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Report cards</h1>
          <div class="muted">Termly report cards combining results and attendance</div>
        </div>
      </div>

      <div class="filters">
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Exam</mat-label>
          <mat-select [(ngModel)]="examId" (selectionChange)="load()">
            @for (e of exams(); track e._id) {
              <mat-option [value]="e._id">{{ e.class?.name }} — {{ e.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      <div class="table-card">
        <app-loading-bar [active]="loading()" />
        @if (!examId()) {
          <div class="empty-state">
            <mat-icon>description</mat-icon>
            <div>Choose an exam to see whose report cards are ready.</div>
          </div>
        } @else if (!rows().length) {
          <div class="empty-state">
            <mat-icon>description</mat-icon>
            <div>No active students in that class.</div>
          </div>
        } @else {
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Student</th>
              <td mat-cell *matCellDef="let r">
                <div>{{ r.name }}</div>
                <div class="muted small">{{ r.admissionNumber }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="subjects">
              <th mat-header-cell *matHeaderCellDef>Subjects</th>
              <td mat-cell *matCellDef="let r">{{ r.subjects }}</td>
            </ng-container>
            <ng-container matColumnDef="average">
              <th mat-header-cell *matHeaderCellDef>Average</th>
              <td mat-cell *matCellDef="let r">{{ r.ready ? r.average + '%' : '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="position">
              <th mat-header-cell *matHeaderCellDef>Position</th>
              <td mat-cell *matCellDef="let r">{{ r.position ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="attendance">
              <th mat-header-cell *matHeaderCellDef>Attendance</th>
              <td mat-cell *matCellDef="let r">
                @if (r.attendanceRate === null) {
                  <span class="muted" matTooltip="No registers taken for this class yet">—</span>
                } @else {
                  <span [class.low]="r.attendanceRate < 85">{{ r.attendanceRate }}%</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let r">
                @if (r.ready) {
                  <button mat-stroked-button (click)="download(r)">
                    <mat-icon>picture_as_pdf</mat-icon> Report card
                  </button>
                } @else {
                  <span class="muted small" matTooltip="No marks have been entered for this student">
                    No results yet
                  </span>
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
    .page { padding: 24px 28px; max-width: 1080px; }
    .page-head { margin-bottom: 18px; }
    h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .muted { color: #78909c; }
    .small { font-size: 12px; }
    .filters { display: flex; gap: 12px; margin-bottom: 14px; }
    .wide { min-width: 380px; }
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .low { color: #c62828; font-weight: 500; }
    .empty-state { padding: 56px 20px; text-align: center; color: #90a4ae; }
    .empty-state mat-icon { font-size: 42px; width: 42px; height: 42px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private downloads = inject(DownloadService);

  exams = signal<Exam[]>([]);
  rows = signal<ReportCardRow[]>([]);
  examId = signal('');
  loading = signal(false);
  columns = ['name', 'subjects', 'average', 'position', 'attendance', 'actions'];

  constructor() {
    this.api.exams().subscribe({
      next: (r) => this.exams.set(r.exams),
      error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
    });
  }

  load() {
    if (!this.examId()) return;
    this.loading.set(true);
    this.api.reportCards(this.examId()).subscribe({
      next: (r) => {
        this.rows.set(r.students);
        this.loading.set(false);
      },
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 6000 });
        this.loading.set(false);
      },
    });
  }

  download(row: ReportCardRow) {
    this.downloads
      .save(this.api.reportCardUrl(this.examId(), row.student), `report-${row.admissionNumber}.pdf`)
      .catch(() => this.snack.open('Could not download that report card.', 'OK', { duration: 5000 }));
  }
}
