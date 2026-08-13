import { Component, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { ProcessInstance } from '../core/models';
import { StatusChipComponent } from './status-chip';

@Component({
  selector: 'app-instance-list',
  imports: [DatePipe, MatTableModule, MatIconModule, StatusChipComponent],
  template: `
    @if (instances().length === 0) {
      <div class="empty-state">
        <mat-icon>inbox</mat-icon>
        <div>{{ emptyMessage() }}</div>
      </div>
    } @else {
      <table mat-table [dataSource]="instances()">
        <ng-container matColumnDef="reference">
          <th mat-header-cell *matHeaderCellDef>Ref</th>
          <td mat-cell *matCellDef="let i" class="ref-cell">{{ i.reference }}</td>
        </ng-container>
        <ng-container matColumnDef="process">
          <th mat-header-cell *matHeaderCellDef>Process</th>
          <td mat-cell *matCellDef="let i">{{ i.definitionSnapshot.name }}</td>
        </ng-container>
        <ng-container matColumnDef="initiator">
          <th mat-header-cell *matHeaderCellDef>Requested by</th>
          <td mat-cell *matCellDef="let i">{{ i.initiatorName }}</td>
        </ng-container>
        <ng-container matColumnDef="step">
          <th mat-header-cell *matHeaderCellDef>Current step</th>
          <td mat-cell *matCellDef="let i">
            @if (i.status === 'in_progress') {
              {{ i.definitionSnapshot.steps[i.currentStep].name }}
              <span class="muted">({{ i.currentStep + 1 }}/{{ i.definitionSnapshot.steps.length }})</span>
            } @else {
              <span class="muted">—</span>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let i"><app-status-chip [status]="i.status" /></td>
        </ng-container>
        <ng-container matColumnDef="updated">
          <th mat-header-cell *matHeaderCellDef>Updated</th>
          <td mat-cell *matCellDef="let i">{{ i.updatedAt | date: 'MMM d, h:mm a' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns()"></tr>
        <tr mat-row *matRowDef="let row; columns: columns()" class="clickable-row" (click)="open(row)"></tr>
      </table>
    }
  `,
  styles: `
    :host { display: block; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .ref-cell { font-weight: 500; white-space: nowrap; }
  `,
})
export class InstanceListComponent {
  private router = inject(Router);
  instances = input.required<ProcessInstance[]>();
  showInitiator = input(false);
  emptyMessage = input('Nothing here yet');

  columns() {
    return this.showInitiator()
      ? ['reference', 'process', 'initiator', 'step', 'status', 'updated']
      : ['reference', 'process', 'step', 'status', 'updated'];
  }

  open(i: ProcessInstance) {
    this.router.navigate(['/requests', i._id]);
  }
}
