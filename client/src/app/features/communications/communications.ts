import { ChangeDetectionStrategy, Component, Inject, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Announcement, Audience, SchoolClass } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: 'staff', label: 'All staff', hint: 'Everyone with an account at the school' },
  { value: 'guardians', label: 'All guardians', hint: 'One message per guardian address on file' },
  { value: 'class_guardians', label: 'Guardians of one class', hint: 'Guardians of active students in that class' },
];

/**
 * Composing an announcement.
 *
 * The recipient count is fetched live and shown on the send button, because
 * the one thing a sender needs to know before mailing a whole school is how
 * many people that actually is.
 */
@Component({
  selector: 'app-announcement-dialog',
  imports: [
    FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>New announcement</h2>
    <mat-dialog-content class="content">
      <mat-form-field appearance="outline">
        <mat-label>Send to</mat-label>
        <mat-select [(ngModel)]="audience" (selectionChange)="countAudience()">
          @for (a of audiences; track a.value) {
            <mat-option [value]="a.value">{{ a.label }}</mat-option>
          }
        </mat-select>
        <mat-hint>{{ hintFor(audience) }}</mat-hint>
      </mat-form-field>

      @if (audience === 'class_guardians') {
        <mat-form-field appearance="outline">
          <mat-label>Class</mat-label>
          <mat-select [(ngModel)]="klass" (selectionChange)="countAudience()">
            @for (c of data.classes; track c._id) {
              <mat-option [value]="c._id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      <mat-form-field appearance="outline">
        <mat-label>Subject</mat-label>
        <input matInput [(ngModel)]="subject" maxlength="200" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Message</mat-label>
        <textarea matInput rows="9" [(ngModel)]="body"></textarea>
        <mat-hint>Plain text. Blank lines become paragraphs.</mat-hint>
      </mat-form-field>

      @if (error) { <div class="error">{{ error }}</div> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancel</button>
      <button mat-flat-button color="primary" (click)="send()" [disabled]="count() === 0">
        <mat-icon>send</mat-icon>
        @if (count() === null) { Send } @else { Send to {{ count() }} }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 560px; padding-top: 8px; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; font-size: 13px; }
  `,
})
export class AnnouncementDialogComponent {
  private api = inject(ApiService);
  audiences = AUDIENCES;
  audience: Audience = 'guardians';
  klass = '';
  subject = '';
  body = '';
  error = '';
  count = signal<number | null>(null);

  constructor(
    public ref: MatDialogRef<AnnouncementDialogComponent, unknown>,
    @Inject(MAT_DIALOG_DATA) public data: { classes: SchoolClass[] }
  ) {
    this.countAudience();
  }

  hintFor(value: Audience) {
    return AUDIENCES.find((a) => a.value === value)?.hint || '';
  }

  countAudience() {
    if (this.audience === 'class_guardians' && !this.klass) {
      this.count.set(null);
      return;
    }
    this.api.audienceSize(this.audience, this.klass || undefined).subscribe({
      next: (r) => this.count.set(r.count),
      error: () => this.count.set(null),
    });
  }

  send() {
    this.error = '';
    if (!this.subject.trim()) { this.error = 'A subject is required.'; return; }
    if (!this.body.trim()) { this.error = 'A message is required.'; return; }
    if (this.audience === 'class_guardians' && !this.klass) { this.error = 'Choose a class.'; return; }
    this.ref.close({
      subject: this.subject.trim(),
      body: this.body.trim(),
      audience: this.audience,
      ...(this.audience === 'class_guardians' ? { class: this.klass } : {}),
    });
  }
}

@Component({
  selector: 'app-communications',
  imports: [
    DatePipe, MatButtonModule, MatIconModule, MatExpansionModule,
    MatPaginatorModule, MatProgressBarModule,
  ],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Communications</h1>
          <div class="muted">Announcements sent to staff and guardians</div>
        </div>
        @if (canSend()) {
          <button mat-flat-button color="primary" (click)="compose()">
            <mat-icon>campaign</mat-icon> New announcement
          </button>
        }
      </div>

      <div class="loading-slot">
        @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      </div>
      @if (!loaded()) {
        <div class="card empty-state">
          <mat-icon>hourglass_empty</mat-icon>
          <div>Loading announcements…</div>
        </div>
      } @else if (!announcements().length) {
        <div class="card empty-state">
          <mat-icon>campaign</mat-icon>
          <div>Nothing has been sent yet.</div>
        </div>
      } @else {
        <mat-accordion class="list">
          @for (a of announcements(); track a._id) {
            <mat-expansion-panel>
              <mat-expansion-panel-header>
                <mat-panel-title>{{ a.subject }}</mat-panel-title>
                <mat-panel-description>
                  <span class="chip">{{ audienceLabel(a) }}</span>
                  <span class="muted small">
                    {{ a.recipients }} recipient{{ a.recipients === 1 ? '' : 's' }} ·
                    {{ a.sentByName }} · {{ a.createdAt | date: 'MMM d, y' }}
                  </span>
                </mat-panel-description>
              </mat-expansion-panel-header>
              <p class="body">{{ a.body }}</p>
              @if (a.skipped) {
                <div class="muted small">{{ a.skipped }} message(s) were already queued and not re-sent.</div>
              }
            </mat-expansion-panel>
          }
        </mat-accordion>
        @if (total()) {
          <mat-paginator
            class="card"
            [length]="total()"
            [pageSize]="pageSize()"
            [pageIndex]="pageIndex()"
            [pageSizeOptions]="[25, 50, 100]"
            (page)="onPage($event)"
            aria-label="Select page of announcements"
          />
        }
      }
    </div>
  `,
  styles: `
    .page { padding: 24px 28px; max-width: 940px; }
    .page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .muted { color: #78909c; }
    .small { font-size: 12px; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .list { display: block; }
    mat-panel-description { display: flex; align-items: center; gap: 10px; justify-content: flex-end; }
    .chip { background: #e3f2fd; color: #1565c0; border-radius: 12px; padding: 2px 10px; font-size: 12px; white-space: nowrap; }
    .body { white-space: pre-wrap; line-height: 1.6; font-size: 14px; margin: 4px 0 0; }
    .empty-state { padding: 56px 20px; text-align: center; color: #90a4ae; }
    .empty-state mat-icon { font-size: 42px; width: 42px; height: 42px; }
    .loading-slot { height: 4px; }
    mat-paginator.card { margin-top: 12px; border-radius: 8px; }
    @media (max-width: 599px) {
      .page { padding: 16px; }
      .page-head { flex-direction: column; gap: 12px; align-items: stretch; }
      mat-panel-description { justify-content: flex-start; flex-wrap: wrap; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunicationsComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  announcements = signal<Announcement[]>([]);
  classes = signal<SchoolClass[]>([]);
  total = signal(0);
  loading = signal(false);
  loaded = signal(false);
  pageIndex = signal(0);
  pageSize = signal(25);
  canSend = computed(() => this.auth.hasPerm('comms.send'));

  constructor() {
    this.load();
    this.api.classes().subscribe((r) => this.classes.set(r.classes));
  }

  onPage(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api
      .announcements({ skip: this.pageIndex() * this.pageSize(), limit: this.pageSize() })
      .subscribe({
        next: (r) => {
          this.announcements.set(r.announcements);
          this.total.set(r.total);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: (err) => {
          this.snack.open(errorMessage(err), 'OK', { duration: 5000 });
          this.loaded.set(true);
          this.loading.set(false);
        },
      });
  }

  audienceLabel(a: Announcement) {
    if (a.audience === 'class_guardians') return `Guardians · ${a.class?.name || 'class'}`;
    return a.audience === 'staff' ? 'All staff' : 'All guardians';
  }

  compose() {
    this.dialog
      .open(AnnouncementDialogComponent, { data: { classes: this.classes() } })
      .afterClosed()
      .subscribe((body) => {
        if (!body) return;
        this.api.sendAnnouncement(body).subscribe({
          next: (r) => {
            this.snack.open(`Queued ${r.queued} message${r.queued === 1 ? '' : 's'}`, 'OK', { duration: 5000 });
            // The new announcement is the newest, so it is on the first page.
            this.pageIndex.set(0);
            this.load();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 6000 }),
        });
      });
  }
}
