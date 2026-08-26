import { ChangeDetectionStrategy, Component, Inject, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/api.service';
import { PermissionDef, Role } from '../../../core/models';
import { errorMessage } from '../../../core/auth.interceptor';
import { confirmDialog } from '../../../shared/confirm-dialog';
import { LoadingBarComponent } from '../../../shared/loading-bar';

interface RoleDialogData {
  role: Role | null;
  permissions: PermissionDef[];
}

@Component({
  selector: 'app-role-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.role ? 'Edit role' : 'New role' }}</h2>
    <mat-dialog-content class="content">
      <mat-form-field appearance="outline">
        <mat-label>Role name</mat-label>
        <input matInput [(ngModel)]="name" placeholder="e.g. Head of Department" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Description</mat-label>
        <input matInput [(ngModel)]="description" />
      </mat-form-field>

      <mat-checkbox [(ngModel)]="isTeaching" class="teaching">
        Teaching staff
        <span class="hint">Members of this role appear in the teacher directory</span>
      </mat-checkbox>

      <div class="perm-title">Permissions</div>
      @for (group of groups(); track group) {
        <div class="perm-group">
          <div class="perm-group-name">{{ group }}</div>
          @for (p of byGroup(group); track p.key) {
            <mat-checkbox [checked]="selected.has(p.key)" (change)="toggle(p.key, $event.checked)">
              {{ p.label }}
              <span class="perm-key">{{ p.key }}</span>
            </mat-checkbox>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!name.trim()" (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 420px; padding-top: 8px; }
    .perm-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: #90a4ae; margin: 4px 0 8px; }
    .perm-group { margin-bottom: 12px; display: flex; flex-direction: column; }
    .perm-group-name { font-weight: 500; font-size: 13px; margin-bottom: 2px; }
    .perm-key { color: #90a4ae; font-size: 11px; font-family: monospace; margin-left: 6px; }
    .teaching { margin: 4px 0 16px; }
    .hint { display: block; color: #90a4ae; font-size: 12px; margin-left: 0; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleDialogComponent {
  name = '';
  description = '';
  isTeaching = false;
  selected = new Set<string>();

  constructor(
    public ref: MatDialogRef<RoleDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RoleDialogData
  ) {
    if (data.role) {
      this.name = data.role.name;
      this.description = data.role.description;
      this.isTeaching = !!data.role.isTeaching;
      this.selected = new Set(data.role.permissions);
    }
  }

  groups(): string[] {
    return [...new Set(this.data.permissions.map((p) => p.group))];
  }

  byGroup(group: string): PermissionDef[] {
    return this.data.permissions.filter((p) => p.group === group);
  }

  toggle(key: string, checked: boolean) {
    if (checked) this.selected.add(key);
    else this.selected.delete(key);
  }

  save() {
    this.ref.close({
      name: this.name.trim(),
      description: this.description,
      isTeaching: this.isTeaching,
      permissions: [...this.selected],
    });
  }
}

@Component({
  selector: 'app-roles',
  imports: [
    MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule,
    MatDialogModule, LoadingBarComponent,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Roles & permissions</h1>
        <span class="spacer"></span>
        <button mat-flat-button color="primary" (click)="openDialog(null)">
          <mat-icon>add</mat-icon> New role
        </button>
      </div>

      <div class="table-card">
        <app-loading-bar [active]="loading()" />
        <table mat-table [dataSource]="roles()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Role</th>
            <td mat-cell *matCellDef="let r">
              <b>{{ r.name }}</b>
              @if (r.isSystem) {
                <mat-icon class="lock" matTooltip="System role — cannot be modified or deleted">lock</mat-icon>
              }
              <div class="muted desc">{{ r.description }}</div>
            </td>
          </ng-container>
          <ng-container matColumnDef="permissions">
            <th mat-header-cell *matHeaderCellDef>Permissions</th>
            <td mat-cell *matCellDef="let r">
              <div class="perm-chips">
                @for (p of r.permissions; track p) {
                  <span class="perm-chip">{{ p }}</span>
                }
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="users">
            <th mat-header-cell *matHeaderCellDef>Users</th>
            <td mat-cell *matCellDef="let r">{{ r.userCount }}</td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r" class="actions-cell">
              @if (!r.isSystem) {
                <button mat-icon-button (click)="openDialog(r)" matTooltip="Edit"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button (click)="remove(r)" matTooltip="Delete"><mat-icon>delete</mat-icon></button>
              }
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
    .lock { font-size: 15px; width: 15px; height: 15px; vertical-align: -2px; margin-left: 6px; color: #90a4ae; }
    .desc { font-size: 12px; }
    .perm-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 0; }
    .perm-chip { background: #eceff1; color: #455a64; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-family: monospace; }
    .actions-cell { text-align: right; white-space: nowrap; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  roles = signal<Role[]>([]);
  permissions = signal<PermissionDef[]>([]);
  loading = signal(false);
  columns = ['name', 'permissions', 'users', 'actions'];

  constructor() {
    this.reload();
    this.api.permissions().subscribe((res) => this.permissions.set(res.permissions));
  }

  reload() {
    this.loading.set(true);
    this.api.roles().subscribe({
      next: (res) => {
        this.roles.set(res.roles);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openDialog(role: Role | null) {
    this.dialog
      .open(RoleDialogComponent, { data: { role, permissions: this.permissions() } })
      .afterClosed()
      .subscribe((body) => {
        if (!body) return;
        const req = role ? this.api.updateRole(role.id, body) : this.api.createRole(body);
        req.subscribe({
          next: () => {
            this.snack.open(role ? 'Role updated' : 'Role created', 'OK', { duration: 3000 });
            this.reload();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 4000 }),
        });
      });
  }

  remove(role: Role) {
    confirmDialog(this.dialog, {
      title: 'Delete this role?',
      message:
        `"${role.name}" will be removed. This only works while no user holds it and no ` +
        `process step is assigned to it.`,
      confirmLabel: 'Delete role',
    }).subscribe((ok) => {
      if (!ok) return;
      this.api.deleteRole(role.id).subscribe({
        next: () => this.reload(),
        error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 5000 }),
      });
    });
  }
}
