import { Component, Inject, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DownloadService } from '../../core/download.service';
import { Exam, ExamSubject, PublishOutcome, ResultRow } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';

/**
 * Publishing is the one irreversible-feeling action here — it mails every
 * guardian — so it gets a confirmation that states exactly who will be
 * written to, and who will be missed and why.
 */
@Component({
  selector: 'app-publish-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Publish results to guardians</h2>
    <mat-dialog-content class="content">
      <p class="lead">
        {{ data.withResults }} student{{ data.withResults === 1 ? '' : 's' }} will have their results
        emailed to the guardian addresses held on file.
      </p>
      @if (data.republish) {
        <div class="warn">
          <mat-icon inline>replay</mat-icon>
          These results were published before. Guardians will receive an updated message.
        </div>
      }
      @if (data.noGuardian) {
        <div class="warn">
          <mat-icon inline>mail_lock</mat-icon>
          {{ data.noGuardian }} student{{ data.noGuardian === 1 ? ' has' : 's have' }} no guardian email
          and will be skipped. Add one on the student record and publish again.
        </div>
      }
      @if (data.noResults) {
        <div class="warn">
          <mat-icon inline>rule</mat-icon>
          {{ data.noResults }} student{{ data.noResults === 1 ? ' has' : 's have' }} no marks entered
          and will be skipped.
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(false)">Cancel</button>
      <button mat-flat-button color="primary" (click)="ref.close(true)">
        <mat-icon>send</mat-icon> Publish
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { min-width: 460px; max-width: 540px; padding-top: 8px; }
    .lead { font-size: 15px; line-height: 1.55; margin: 0 0 4px; }
    .warn {
      display: flex; gap: 8px; align-items: flex-start; background: #fff8e1;
      border: 1px solid #ffe082; color: #8a6100; border-radius: 8px;
      padding: 10px 12px; margin-top: 12px; font-size: 13px; line-height: 1.5;
    }
  `,
})
export class PublishDialogComponent {
  constructor(
    public ref: MatDialogRef<PublishDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: {
      withResults: number; noGuardian: number; noResults: number; republish: boolean;
    }
  ) {}
}

@Component({
  selector: 'app-exam-results',
  imports: [
    FormsModule, RouterLink, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatTooltipModule,
  ],
  template: `
    <div class="page">
      <a class="back" routerLink="/exams"><mat-icon>arrow_back</mat-icon> All exams</a>

      @if (exam(); as e) {
        <div class="page-head">
          <div>
            <h1>{{ e.label }}</h1>
            <div class="muted">{{ e.class?.name }} · {{ rows().length }} students · {{ e.subjects.length }} subjects</div>
          </div>
          <div class="actions">
            <span class="chip" [class]="e.status">{{ e.status }}</span>
            @if (dirty().size && canEnter()) {
              <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
                <mat-icon>save</mat-icon> Save {{ dirty().size }} change{{ dirty().size === 1 ? '' : 's' }}
              </button>
            }
            @if (canManage() && e.status === 'open') {
              <button mat-stroked-button color="primary" (click)="publish()" [disabled]="!!dirty().size">
                <mat-icon>send</mat-icon> Publish
              </button>
            }
          </div>
        </div>

        @if (e.status !== 'open') {
          <div class="banner">
            <mat-icon>info</mat-icon>
            <div>
              @if (e.status === 'draft') {
                This exam is still a draft. Open it for entry before teachers can record marks.
              } @else {
                These results have been published. Reopen the exam to correct a mark.
              }
            </div>
          </div>
        }

        <div class="grid-card">
          <table class="grid">
            <thead>
              <tr>
                <th class="sticky name">Student</th>
                @for (s of e.subjects; track subjectId(s)) {
                  <th class="score" [matTooltip]="'Out of ' + s.maxScore">
                    {{ subjectName(s) }}
                    <div class="muted small">/{{ s.maxScore }}</div>
                  </th>
                }
                <th class="num">Average</th>
                <th class="num">Position</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.student) {
                <tr>
                  <td class="sticky name">
                    <div>{{ row.name }}</div>
                    <div class="muted small">
                      {{ row.admissionNumber }}
                      @if (!row.guardianCount) {
                        <span class="nomail" matTooltip="No guardian email — this student's results cannot be sent">
                          <mat-icon inline>mail_lock</mat-icon>
                        </span>
                      }
                    </div>
                  </td>
                  @for (s of e.subjects; track subjectId(s)) {
                    <td class="score">
                      <input class="cell" type="number" min="0" [max]="s.maxScore"
                             [disabled]="!canEnter() || e.status !== 'open'"
                             [class.changed]="isDirty(row.student, subjectId(s))"
                             [class.over]="isOver(row.student, subjectId(s), s.maxScore)"
                             [ngModel]="scoreOf(row, subjectId(s))"
                             (ngModelChange)="setScore(row.student, subjectId(s), $event)" />
                    </td>
                  }
                  <td class="num">{{ row.average }}%</td>
                  <td class="num">{{ row.position ?? '—' }}</td>
                  <td class="num">
                    @if (row.count) {
                      <button mat-icon-button (click)="sheet(row)" matTooltip="Download result sheet">
                        <mat-icon>picture_as_pdf</mat-icon>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (!rows().length) {
            <div class="empty-state">
              <mat-icon>groups</mat-icon>
              <div>No active students in this class yet.</div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .page { padding: 24px 28px; max-width: 1280px; }
    .back { display: inline-flex; align-items: center; gap: 5px; color: #78909c; text-decoration: none; font-size: 13px; margin-bottom: 14px; }
    .back mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; gap: 16px; }
    h1 { margin: 0; font-size: 23px; font-weight: 600; }
    .muted { color: #78909c; }
    .small { font-size: 11px; }
    .actions { display: flex; align-items: center; gap: 10px; }
    .chip { border-radius: 12px; padding: 3px 11px; font-size: 12px; font-weight: 500; text-transform: capitalize; }
    .chip.draft { background: #eceff1; color: #546e7a; }
    .chip.open { background: #e3f2fd; color: #1565c0; }
    .chip.published { background: #e8f5e9; color: #2e7d32; }
    .banner {
      display: flex; gap: 12px; align-items: center; background: #f5f9ff;
      border: 1px solid #d0e2f7; border-radius: 8px; padding: 12px 16px;
      margin-bottom: 16px; color: #37474f; font-size: 13px;
    }
    .banner mat-icon { color: #1565c0; }
    .grid-card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.12); overflow: auto; }
    .grid { border-collapse: separate; border-spacing: 0; width: 100%; }
    .grid th, .grid td { padding: 8px 12px; border-bottom: 1px solid #eceff1; text-align: center; white-space: nowrap; }
    .grid th { font-size: 11px; letter-spacing: .5px; text-transform: uppercase; color: #90a4ae; font-weight: 600; background: #fafbfc; }
    .sticky { position: sticky; left: 0; background: #fff; z-index: 2; }
    thead .sticky { background: #fafbfc; z-index: 3; }
    .name { text-align: left; min-width: 210px; box-shadow: 1px 0 0 #eceff1; }
    .num { text-align: right; }
    .cell {
      width: 62px; padding: 6px 8px; text-align: center; font-size: 14px;
      border: 1px solid #dfe4e8; border-radius: 6px; font-family: inherit;
    }
    .cell:focus { outline: none; border-color: #1565c0; box-shadow: 0 0 0 2px rgba(21,101,192,.15); }
    .cell:disabled { background: #f7f8f9; color: #90a4ae; }
    .cell.changed { border-color: #f9a825; background: #fffdf5; }
    .cell.over { border-color: #c62828; background: #fff5f5; color: #c62828; }
    .nomail { color: #f9a825; margin-left: 4px; }
    .nomail mat-icon { font-size: 13px; width: 13px; height: 13px; vertical-align: -2px; }
    .empty-state { padding: 48px 20px; text-align: center; color: #90a4ae; }
  `,
})
export class ExamResultsComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private downloads = inject(DownloadService);
  private route = inject(ActivatedRoute);

  exam = signal<Exam | null>(null);
  rows = signal<ResultRow[]>([]);
  saving = signal(false);
  /** Cell key -> the value typed but not yet saved. */
  dirty = signal(new Map<string, number | null>());

  canEnter = computed(() => this.auth.hasPerm('results.enter'));
  canManage = computed(() => this.auth.hasPerm('exams.manage'));

  private id = this.route.snapshot.paramMap.get('id') || '';

  constructor() {
    this.load(this.route.snapshot.queryParamMap.get('publish') === '1');
  }

  private load(thenPublish = false) {
    this.api.examResults(this.id).subscribe({
      next: (r) => {
        this.exam.set(r.exam);
        this.rows.set(r.rows);
        this.dirty.set(new Map());
        if (thenPublish) this.publish();
      },
      error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 6000 }),
    });
  }

  subjectId(s: ExamSubject) { return s.subject._id; }
  subjectName(s: ExamSubject) { return s.subject.name; }

  private key(student: string, subject: string) { return `${student}:${subject}`; }

  scoreOf(row: ResultRow, subject: string): number | null {
    const k = this.key(row.student, subject);
    if (this.dirty().has(k)) return this.dirty().get(k)!;
    return row.scores.find((s) => s.subject === subject)?.score ?? null;
  }

  isDirty(student: string, subject: string) { return this.dirty().has(this.key(student, subject)); }

  isOver(student: string, subject: string, max: number) {
    const value = this.dirty().get(this.key(student, subject));
    return typeof value === 'number' && value > max;
  }

  setScore(student: string, subject: string, value: unknown) {
    const raw = value === '' || value === null ? null : Number(value);
    const next = new Map(this.dirty());
    next.set(this.key(student, subject), Number.isNaN(raw as number) ? null : raw);
    this.dirty.set(next);
  }

  save() {
    const exam = this.exam();
    if (!exam) return;

    // Caught here rather than at the server so the teacher is not told
    // "row 14 is over the maximum" for a grid they can see all of.
    const maxBySubject = new Map(exam.subjects.map((s) => [this.subjectId(s), s.maxScore]));
    const cells = [...this.dirty()].map(([k, score]) => {
      const [student, subject] = k.split(':');
      return { student, subject, score };
    });
    const over = cells.find((c) => typeof c.score === 'number' && c.score > (maxBySubject.get(c.subject) ?? 100));
    if (over) {
      this.snack.open('One of those scores is above the subject maximum.', 'OK', { duration: 5000 });
      return;
    }

    this.saving.set(true);
    this.api.saveResults(this.id, cells).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.snack.open(`Saved ${r.saved} score${r.saved === 1 ? '' : 's'}`, 'OK', { duration: 3000 });
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.snack.open(errorMessage(err), 'OK', { duration: 6000 });
      },
    });
  }

  publish() {
    const exam = this.exam();
    if (!exam) return;
    const rows = this.rows();
    const withResults = rows.filter((r) => r.count > 0);

    this.dialog
      .open(PublishDialogComponent, {
        data: {
          withResults: withResults.filter((r) => r.guardianCount > 0).length,
          noGuardian: withResults.filter((r) => !r.guardianCount).length,
          noResults: rows.length - withResults.length,
          republish: (exam.publishCount || 0) > 0,
        },
      })
      .afterClosed()
      .subscribe((go) => {
        if (!go) return;
        this.api.publishExam(this.id).subscribe({
          next: (r: PublishOutcome) => {
            this.snack.open(
              `Published — ${r.queued} email${r.queued === 1 ? '' : 's'} queued for ${r.students} student${r.students === 1 ? '' : 's'}`,
              'OK',
              { duration: 6000 }
            );
            this.load();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 6000 }),
        });
      });
  }

  sheet(row: ResultRow) {
    const exam = this.exam();
    if (!exam) return;
    this.downloads
      .save(this.api.resultSheetUrl(this.id, row.student), `${row.admissionNumber}-${exam.session.replace('/', '-')}-${exam.term}.pdf`)
      .catch(() => this.snack.open('Could not download that result sheet.', 'OK', { duration: 5000 }));
  }
}
