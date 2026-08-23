import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/api.service';
import { EmailCounts, EmailDelivery } from '../../../core/models';
import { errorMessage } from '../../../core/auth.interceptor';

/**
 * Email delivery health for this school. Defaults to the messages that need
 * attention, so a bouncing address is visible without reading the database.
 */
@Component({
  selector: 'app-emails',
  imports: [
    DatePipe, RouterLink, MatTableModule, MatIconModule,
    MatButtonModule, MatButtonToggleModule, MatTooltipModule,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Email delivery</h1>
        <span class="muted">Notification emails sent on behalf of your school</span>
        <span class="spacer"></span>
        <button mat-stroked-button (click)="load()" matTooltip="Refresh">
          <mat-icon>refresh</mat-icon> Refresh
        </button>
      </div>

      @if (counts(); as c) {
        <div class="cards">
          <div class="stat"><div class="num warn">{{ c.failed }}</div><div class="label">Failed</div></div>
          <div class="stat"><div class="num muted-num">{{ c.skipped }}</div><div class="label">Skipped</div></div>
          <div class="stat"><div class="num">{{ c.pending }}</div><div class="label">Queued</div></div>
          <div class="stat"><div class="num ok">{{ c.sent }}</div><div class="label">Delivered</div></div>
        </div>
      }

      <div class="page-header">
        <mat-button-toggle-group [value]="filter()" (change)="setFilter($event.value)" hideSingleSelectionIndicator>
          <mat-button-toggle value="">Needs attention</mat-button-toggle>
          <mat-button-toggle value="failed">Failed</mat-button-toggle>
          <mat-button-toggle value="skipped">Skipped</mat-button-toggle>
          <mat-button-toggle value="pending">Queued</mat-button-toggle>
          <mat-button-toggle value="sent">Delivered</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <div class="table-card">
        @if (emails().length === 0 && loaded()) {
          <div class="empty-state">
            <mat-icon>mark_email_read</mat-icon>
            <div>{{ filter() ? 'Nothing with this status.' : 'No delivery problems — every email got through.' }}</div>
          </div>
        } @else {
          <table mat-table [dataSource]="emails()">
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let e">
                <span class="status-chip" [class]="chipClass(e.status)">{{ label(e.status) }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="recipient">
              <th mat-header-cell *matHeaderCellDef>Recipient</th>
              <td mat-cell *matCellDef="let e">
                <b>{{ e.toName || '—' }}</b>
                <div class="muted small">{{ e.to }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="subject">
              <th mat-header-cell *matHeaderCellDef>Subject</th>
              <td mat-cell *matCellDef="let e">
                @if (e.instance) {
                  <a [routerLink]="['/requests', e.instance]" class="subject-link">{{ e.subject }}</a>
                } @else {
                  {{ e.subject }}
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="attempts">
              <th mat-header-cell *matHeaderCellDef>Tries</th>
              <td mat-cell *matCellDef="let e">{{ e.attempts }}</td>
            </ng-container>
            <ng-container matColumnDef="reason">
              <th mat-header-cell *matHeaderCellDef>Last error</th>
              <td mat-cell *matCellDef="let e" class="reason">
                @if (e.lastError) {
                  <span [matTooltip]="e.lastError">{{ e.lastError }}</span>
                } @else {
                  <span class="muted">—</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="when">
              <th mat-header-cell *matHeaderCellDef>Queued</th>
              <td mat-cell *matCellDef="let e" class="nowrap">{{ e.createdAt | date: 'MMM d, h:mm a' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let e" class="actions-cell">
                @if (e.status === 'failed' || e.status === 'skipped') {
                  <button mat-stroked-button [disabled]="retrying().has(e._id)" (click)="retry(e)">
                    <mat-icon>replay</mat-icon> Retry
                  </button>
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
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .stat { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .num { font-size: 28px; font-weight: 600; }
    .num.warn { color: #c62828; }
    .num.ok { color: #2e7d32; }
    .num.muted-num { color: #78909c; }
    .label { color: #78909c; font-size: 13px; margin-top: 2px; }
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .small { font-size: 12px; }
    .nowrap { white-space: nowrap; }
    .subject-link { color: #1565c0; text-decoration: none; }
    .subject-link:hover { text-decoration: underline; }
    .reason { font-size: 12px; color: #c62828; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .actions-cell { text-align: right; white-space: nowrap; }
  `,
})
export class EmailsComponent {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  emails = signal<EmailDelivery[]>([]);
  counts = signal<EmailCounts | null>(null);
  filter = signal('');
  loaded = signal(false);
  retrying = signal(new Set<string>());
  columns = ['status', 'recipient', 'subject', 'attempts', 'reason', 'when', 'actions'];

  constructor() {
    this.load();
  }

  load() {
    this.loaded.set(false);
    this.api.emails(this.filter() || undefined).subscribe({
      next: (res) => {
        this.emails.set(res.emails);
        this.counts.set(res.counts);
        this.loaded.set(true);
      },
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        this.loaded.set(true);
      },
    });
  }

  setFilter(value: string) {
    this.filter.set(value);
    this.load();
  }

  label(status: string): string {
    return { pending: 'Queued', sent: 'Delivered', failed: 'Failed', skipped: 'Skipped' }[status] ?? status;
  }

  chipClass(status: string): string {
    return { pending: 'in_progress', sent: 'approved', failed: 'rejected', skipped: 'inactive' }[status] ?? 'inactive';
  }

  retry(email: EmailDelivery) {
    this.retrying.update((set) => new Set(set).add(email._id));
    this.api.retryEmail(email._id).subscribe({
      next: () => {
        this.snack.open(`Requeued for ${email.to}`, 'OK', { duration: 3000 });
        this.retrying.update((set) => {
          const next = new Set(set);
          next.delete(email._id);
          return next;
        });
        this.load();
      },
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        this.retrying.update((set) => {
          const next = new Set(set);
          next.delete(email._id);
          return next;
        });
      },
    });
  }
}
