import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';

@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="wrap">
      <mat-card class="card">
        <h1>Change password</h1>
        @if (auth.user()?.mustChangePassword) {
          <div class="notice">
            <mat-icon>info</mat-icon>
            You must set a new password before continuing.
          </div>
        }
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Current password</mat-label>
            <input matInput type="password" formControlName="current" autocomplete="current-password" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>New password</mat-label>
            <input matInput type="password" formControlName="next" autocomplete="new-password" />
            <mat-hint>At least 8 characters</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Confirm new password</mat-label>
            <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
          </mat-form-field>
          @if (error()) {
            <div class="error">{{ error() }}</div>
          }
          <div class="actions">
            @if (!auth.user()?.mustChangePassword) {
              <button mat-button type="button" (click)="router.navigate(['/'])">Cancel</button>
            }
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || busy()">
              Update password
            </button>
          </div>
        </form>
      </mat-card>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; padding: 16px; }
    .card { width: 100%; max-width: 420px; padding: 28px; }
    h1 { margin: 0 0 16px; font-size: 20px; }
    .full { width: 100%; }
    .notice { display: flex; gap: 8px; align-items: center; background: #fff8e1; color: #b26a00; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; font-size: 13px; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
  `,
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);
  readonly router = inject(Router);

  busy = signal(false);
  error = signal('');

  form = this.fb.nonNullable.group({
    current: ['', Validators.required],
    next: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', Validators.required],
  });

  submit() {
    const { current, next, confirm } = this.form.getRawValue();
    if (next !== confirm) {
      this.error.set('New password and confirmation do not match');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.changePassword(current, next).subscribe({
      next: (res) => {
        // The server retires older tokens on a password change; adopt the
        // fresh one so this tab is not signed out by its own request.
        if (res.token) this.auth.setToken(res.token);
        const user = this.auth.user();
        if (user) this.auth.user.set({ ...user, mustChangePassword: false });
        this.snack.open('Password updated', 'OK', { duration: 3000 });
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
