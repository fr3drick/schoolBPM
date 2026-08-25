import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiService, AuditEntry } from '../../core/api.service';

@Component({
  selector: 'app-audit',
  imports: [DatePipe, JsonPipe, MatTableModule, MatIconModule, MatPaginatorModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Audit log</h1>
        @if (loaded()) {
          <span class="muted">{{ total() }} event{{ total() === 1 ? '' : 's' }} recorded</span>
        }
      </div>
      <div class="table-card">
        <div class="loading-slot">
          @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
        </div>
        @if (!loaded()) {
          <div class="empty-state">
            <mat-icon>hourglass_empty</mat-icon>
            <div>Loading the audit log…</div>
          </div>
        } @else if (!logs().length) {
          <div class="empty-state">
            <mat-icon>history</mat-icon>
            <div>Nothing has been recorded yet.</div>
          </div>
        } @else {
        <table mat-table [dataSource]="logs()">
          <ng-container matColumnDef="time">
            <th mat-header-cell *matHeaderCellDef>Time</th>
            <td mat-cell *matCellDef="let l" class="nowrap">{{ l.createdAt | date: 'MMM d, h:mm:ss a' }}</td>
          </ng-container>
          <ng-container matColumnDef="actor">
            <th mat-header-cell *matHeaderCellDef>Who</th>
            <td mat-cell *matCellDef="let l">{{ l.actorName ?? '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="action">
            <th mat-header-cell *matHeaderCellDef>Action</th>
            <td mat-cell *matCellDef="let l"><code>{{ l.action }}</code></td>
          </ng-container>
          <ng-container matColumnDef="details">
            <th mat-header-cell *matHeaderCellDef>Details</th>
            <td mat-cell *matCellDef="let l" class="details">{{ l.details | json }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
        }
        @if (loaded() && total()) {
          <mat-paginator
            [length]="total()"
            [pageSize]="pageSize()"
            [pageIndex]="pageIndex()"
            [pageSizeOptions]="[50, 100, 200, 500]"
            (page)="onPage($event)"
            aria-label="Select page of audit events"
          />
        }
      </div>
    </div>
  `,
  styles: `
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .loading-slot { height: 4px; }
    .nowrap { white-space: nowrap; }
    code { background: #eceff1; border-radius: 4px; padding: 2px 6px; font-size: 12px; }
    .details { font-size: 12px; color: #78909c; font-family: monospace; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class AuditComponent {
  private api = inject(ApiService);
  logs = signal<AuditEntry[]>([]);
  total = signal(0);
  loading = signal(false);
  loaded = signal(false);
  pageIndex = signal(0);
  pageSize = signal(100);
  columns = ['time', 'actor', 'action', 'details'];

  constructor() {
    this.load();
  }

  onPage(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.audit({ skip: this.pageIndex() * this.pageSize(), limit: this.pageSize() }).subscribe({
      next: (res) => {
        this.logs.set(res.logs);
        this.total.set(res.total);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.loaded.set(true);
        this.loading.set(false);
      },
    });
  }
}
