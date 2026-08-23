import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="wrap">
      <mat-card class="card">
        @if (checking()) {
          <p class="muted center">Checking your link…</p>
        } @else if (!valid()) {
          <div class="head">
            <mat-icon class="logo bad">link_off</mat-icon>
            <h1>This link has expired</h1>
            <p class="muted">
              Reset links can only be used once and expire after a short time.
              Request a new one to continue.
            </p>
          </div>
          <a mat-flat-button color="primary" class="full" routerLink="/forgot-password">
            Request a new link
          </a>
          <div class="back"><a routerLink="/login">Back to sign in</a></div>
        } @else {
          <div class="head">
            <mat-icon class="logo">lock_reset</mat-icon>
            <h1>Choose a new password</h1>
            <p class="muted">You'll be signed out everywhere else once it's changed.</p>
          </div>
          <form [formGroup]="form" (ngSubmit)="submit()">
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
            <button mat-flat-button color="primary" class="full" type="submit" [disabled]="form.invalid || busy()">
              {{ busy() ? 'Saving…' : 'Set new password' }}
            </button>
          </form>
        }
      </mat-card>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(160deg, #e3f2fd, #f6f7f9 60%); padding: 16px; }
    .card { width: 100%; max-width: 400px; padding: 32px; }
    .head { text-align: center; margin-bottom: 20px; }
    .logo { font-size: 44px; width: 44px; height: 44px; color: #1565c0; }
    .logo.bad { color: #c62828; }
    h1 { margin: 8px 0 4px; font-size: 20px; }
    p { margin: 0; }
    .center { text-align: center; }
    .full { width: 100%; }
    button.full, a.full { height: 44px; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
    .back { text-align: center; margin-top: 16px; font-size: 13px; }
    .back a { color: #1565c0; text-decoration: none; }
    .back a:hover { text-decoration: underline; }
  `,
})
export class ResetPasswordComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  private token = this.route.snapshot.paramMap.get('token') ?? '';
  checking = signal(true);
  valid = signal(false);
  busy = signal(false);
  error = signal('');

  form = this.fb.nonNullable.group({
    next: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', Validators.required],
  });

  constructor() {
    // Checked up front so an expired link explains itself rather than
    // failing only after the user has typed a new password.
    this.api.checkResetToken(this.token).subscribe({
      next: (res) => {
        this.valid.set(res.valid);
        this.checking.set(false);
      },
      error: () => {
        this.valid.set(false);
        this.checking.set(false);
      },
    });
  }

  submit() {
    const { next, confirm } = this.form.getRawValue();
    if (next !== confirm) {
      this.error.set('New password and confirmation do not match');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.completePasswordReset(this.token, next).subscribe({
      next: () => {
        this.snack.open('Password updated — please sign in', 'OK', { duration: 5000 });
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
