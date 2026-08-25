import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/api.service';
import { ProcessDefinition, RoleRef } from '../../../core/models';
import { errorMessage } from '../../../core/auth.interceptor';
import { confirmDialog } from '../../../shared/confirm-dialog';

@Component({
  selector: 'app-designer-list',
  imports: [RouterLink, MatTableModule, MatIconModule, MatButtonModule, MatSlideToggleModule, MatTooltipModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Process designer</h1>
        <span class="spacer"></span>
        <button mat-flat-button color="primary" routerLink="/admin/processes/new">
          <mat-icon>add</mat-icon> New process
        </button>
      </div>

      <div class="table-card">
        <table mat-table [dataSource]="definitions()">
          <ng-container matColumnDef="key">
            <th mat-header-cell *matHeaderCellDef>Key</th>
            <td mat-cell *matCellDef="let d" class="key-cell">{{ d.key }}</td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Process</th>
            <td mat-cell *matCellDef="let d">
              <b>{{ d.name }}</b>
              <div class="muted small">{{ d.category }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="fields">
            <th mat-header-cell *matHeaderCellDef>Form fields</th>
            <td mat-cell *matCellDef="let d">{{ d.fields.length }}</td>
          </ng-container>
          <ng-container matColumnDef="steps">
            <th mat-header-cell *matHeaderCellDef>Approval steps</th>
            <td mat-cell *matCellDef="let d">{{ stepsSummary(d) }}</td>
          </ng-container>
          <ng-container matColumnDef="active">
            <th mat-header-cell *matHeaderCellDef>Active</th>
            <td mat-cell *matCellDef="let d">
              <mat-slide-toggle [checked]="d.active" (change)="toggleActive(d, $event.checked)" />
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let d" class="actions-cell">
              <button mat-icon-button [routerLink]="['/admin/processes', d._id]" matTooltip="Edit"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button (click)="remove(d)" matTooltip="Delete"><mat-icon>delete</mat-icon></button>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
    </div>
  `,
  styles: `
    .table-card { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .key-cell { font-family: monospace; font-weight: 600; }
    .small { font-size: 12px; }
    .actions-cell { text-align: right; white-space: nowrap; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignerListComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  definitions = signal<ProcessDefinition[]>([]);
  columns = ['key', 'name', 'fields', 'steps', 'active', 'actions'];

  constructor() {
    this.reload();
  }

  reload() {
    this.api.definitions(true).subscribe((res) => this.definitions.set(res.definitions));
  }

  stepsSummary(d: ProcessDefinition): string {
    return d.steps.map((s) => s.name).join(' → ');
  }

  toggleActive(d: ProcessDefinition, active: boolean) {
    this.api.updateDefinition(d._id, this.toBody(d, active)).subscribe({
      next: () => this.reload(),
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        this.reload();
      },
    });
  }

  // The API expects role ids; list responses have them populated as {_id,name}.
  private toBody(d: ProcessDefinition, active: boolean) {
    const roleId = (r: RoleRef | string) => (typeof r === 'string' ? r : r._id);
    return {
      name: d.name,
      key: d.key,
      category: d.category,
      description: d.description,
      initiatorRoles: d.initiatorRoles.map(roleId),
      fields: d.fields,
      steps: d.steps.map((s) => ({ ...s, approverRoles: s.approverRoles.map(roleId) })),
      active,
    };
  }

  remove(d: ProcessDefinition) {
    confirmDialog(this.dialog, {
      title: 'Delete this process?',
      message: `"${d.name}" will be removed. This only works while no request exists for it.`,
      confirmLabel: 'Delete process',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.deleteDefinition(d._id).subscribe({
        next: () => this.reload(),
        error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
      });
    });
  }
}
