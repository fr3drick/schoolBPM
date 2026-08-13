import { Component, Inject, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/api.service';
import { Role, UserProfile } from '../../../core/models';
import { errorMessage } from '../../../core/auth.interceptor';

interface UserDialogData {
  user: UserProfile | null;
  roles: Role[];
}

@Component({
  selector: 'app-user-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.user ? 'Edit user' : 'New user' }}</h2>
    <mat-dialog-content class="content">
      <mat-form-field appearance="outline">
        <mat-label>Full name</mat-label>
        <input matInput [(ngModel)]="name" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Email</mat-label>
        <input matInput type="email" [(ngModel)]="email" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Role</mat-label>
        <mat-select [(ngModel)]="roleId">
          @for (r of data.roles; track r.id) {
            <mat-option [value]="r.id">{{ r.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (!data.user) {
        <mat-form-field appearance="outline">
          <mat-label>Temporary password</mat-label>
          <input matInput [(ngModel)]="password" />
          <mat-hint>At least 8 characters — share it with the user</mat-hint>
        </mat-form-field>
        <mat-checkbox [(ngModel)]="mustChange" class="mc">
          Require password change on first sign-in
        </mat-checkbox>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="!name.trim() || !email.trim() || !roleId || (!data.user && password.length < 8)"
        (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 380px; padding-top: 8px; }
    .mc { margin-bottom: 8px; }
  `,
})
export class UserDialogComponent {
  name = '';
  email = '';
  roleId = '';
  password = '';
  mustChange = true;

  constructor(
    public ref: MatDialogRef<UserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UserDialogData
  ) {
    if (data.user) {
      this.name = data.user.name;
      this.email = data.user.email;
      this.roleId = data.user.role?.id ?? '';
    }
  }

  save() {
    this.ref.close({
      name: this.name.trim(),
      email: this.email.trim(),
      roleId: this.roleId,
      ...(this.data.user ? {} : { password: this.password, mustChangePassword: this.mustChange }),
    });
  }
}

@Component({
  selector: 'app-password-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Reset password</h2>
    <mat-dialog-content>
      <p class="muted">Set a temporary password for {{ data.name }}. They'll be asked to change it at next sign-in.</p>
      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Temporary password</mat-label>
        <input matInput [(ngModel)]="password" />
        <mat-hint>At least 8 characters</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [disabled]="password.length < 8" (click)="ref.close(password)">Reset</button>
    </mat-dialog-actions>
  `,
})
export class PasswordDialogComponent {
  password = '';
  constructor(
    public ref: MatDialogRef<PasswordDialogComponent, string>,
    @Inject(MAT_DIALOG_DATA) public data: { name: string }
  ) {}
}

@Component({
  selector: 'app-users',
  imports: [DatePipe, MatTableModule, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule, MatDialogModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Users</h1>
        <span class="spacer"></span>
        <button mat-flat-button color="primary" (click)="openDialog(null)">
          <mat-icon>person_add</mat-icon> New user
        </button>
      </div>

      <div class="table-card">
        <table mat-table [dataSource]="users()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let u">
              <b>{{ u.name }}</b>
              @if (u.mustChangePassword) {
                <mat-icon class="hint-icon" matTooltip="Must change password at next sign-in">vpn_key</mat-icon>
              }
            </td>
          </ng-container>
          <ng-container matColumnDef="email">
            <th mat-header-cell *matHeaderCellDef>Email</th>
            <td mat-cell *matCellDef="let u">{{ u.email }}</td>
          </ng-container>
          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef>Role</th>
            <td mat-cell *matCellDef="let u">{{ u.role?.name ?? '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let u">
              <span class="status-chip" [class.approved]="u.active" [class.inactive]="!u.active">
                {{ u.active ? 'Active' : 'Deactivated' }}
              </span>
            </td>
          </ng-container>
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>Created</th>
            <td mat-cell *matCellDef="let u">{{ u.createdAt | date: 'MMM d, y' }}</td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let u" class="actions-cell">
              <button mat-icon-button [matMenuTriggerFor]="menu" aria-label="User actions"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="openDialog(u)"><mat-icon>edit</mat-icon> Edit</button>
                <button mat-menu-item (click)="resetPassword(u)"><mat-icon>vpn_key</mat-icon> Reset password</button>
                <button mat-menu-item (click)="toggleActive(u)">
                  <mat-icon>{{ u.active ? 'person_off' : 'how_to_reg' }}</mat-icon>
                  {{ u.active ? 'Deactivate' : 'Reactivate' }}
                </button>
              </mat-menu>
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
    .hint-icon { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; margin-left: 6px; color: #b26a00; }
    .actions-cell { text-align: right; }
  `,
})
export class UsersComponent {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  users = signal<UserProfile[]>([]);
  roles = signal<Role[]>([]);
  columns = ['name', 'email', 'role', 'status', 'created', 'actions'];

  constructor() {
    this.reload();
    this.api.roles().subscribe((res) => this.roles.set(res.roles));
  }

  reload() {
    this.api.users().subscribe((res) => this.users.set(res.users));
  }

  openDialog(user: UserProfile | null) {
    this.dialog
      .open(UserDialogComponent, { data: { user, roles: this.roles() } })
      .afterClosed()
      .subscribe((body) => {
        if (!body) return;
        const req = user ? this.api.updateUser(user.id, body) : this.api.createUser(body);
        req.subscribe({
          next: () => {
            this.snack.open(user ? 'User updated' : 'User created', 'OK', { duration: 3000 });
            this.reload();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 4000 }),
        });
      });
  }

  resetPassword(user: UserProfile) {
    this.dialog
      .open(PasswordDialogComponent, { data: { name: user.name }, width: '420px' })
      .afterClosed()
      .subscribe((password?: string) => {
        if (!password) return;
        this.api.resetPassword(user.id, password).subscribe({
          next: () => {
            this.snack.open(`Password reset for ${user.name}`, 'OK', { duration: 3000 });
            this.reload();
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 4000 }),
        });
      });
  }

  toggleActive(user: UserProfile) {
    this.api.updateUser(user.id, { active: !user.active }).subscribe({
      next: () => this.reload(),
      error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 4000 }),
    });
  }
}
