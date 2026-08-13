import { Component, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { ApiService, AuditEntry } from '../../core/api.service';

@Component({
  selector: 'app-audit',
  imports: [DatePipe, JsonPipe, MatTableModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Audit log</h1>
        <span class="muted">Latest 200 events</span>
      </div>
      <div class="table-card">
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
      </div>
    </div>
  `,
  styles: `
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .nowrap { white-space: nowrap; }
    code { background: #eceff1; border-radius: 4px; padding: 2px 6px; font-size: 12px; }
    .details { font-size: 12px; color: #78909c; font-family: monospace; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class AuditComponent {
  private api = inject(ApiService);
  logs = signal<AuditEntry[]>([]);
  columns = ['time', 'actor', 'action', 'details'];

  constructor() {
    this.api.audit().subscribe((res) => this.logs.set(res.logs));
  }
}
