import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/api.service';

/**
 * The confirmation is identical whether or not the address exists — the UI
 * must not become the enumeration oracle the API deliberately avoids being.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="wrap">
      <mat-card class="card">
        @if (sent()) {
          <div class="head">
            <mat-icon class="logo ok">mark_email_read</mat-icon>
            <h1>Check your email</h1>
            <p class="muted">{{ message() }}</p>
          </div>
          <p class="hint">
            The link works once and expires shortly. If it does not arrive within a few minutes,
            check your spam folder or ask your school office to reset it for you.
          </p>
          <a mat-flat-button color="primary" class="full" routerLink="/login">Back to sign in</a>
        } @else {
          <div class="head">
            <mat-icon class="logo">lock_reset</mat-icon>
            <h1>Forgot your password?</h1>
            <p class="muted">Enter your email and we'll send you a link to choose a new one.</p>
          </div>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full">
              <mat-label>Email</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="username" />
            </mat-form-field>
            <button mat-flat-button color="primary" class="full" type="submit" [disabled]="form.invalid || busy()">
              {{ busy() ? 'Sending…' : 'Send reset link' }}
            </button>
          </form>
          <div class="back"><a routerLink="/login">Back to sign in</a></div>
        }
      </mat-card>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(160deg, #e3f2fd, #f6f7f9 60%); padding: 16px; }
    .card { width: 100%; max-width: 400px; padding: 32px; }
    .head { text-align: center; margin-bottom: 20px; }
    .logo { font-size: 44px; width: 44px; height: 44px; color: #1565c0; }
    .logo.ok { color: #2e7d32; }
    h1 { margin: 8px 0 4px; font-size: 20px; }
    p { margin: 0; }
    .hint { font-size: 13px; color: #637381; line-height: 1.5; margin-bottom: 20px; }
    .full { width: 100%; }
    button.full, a.full { height: 44px; }
    .back { text-align: center; margin-top: 16px; font-size: 13px; }
    .back a, .hint a { color: #1565c0; text-decoration: none; }
    .back a:hover { text-decoration: underline; }
  `,
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);

  busy = signal(false);
  sent = signal(false);
  message = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submit() {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.api.forgotPassword(this.form.getRawValue().email).subscribe({
      next: (res) => {
        this.message.set(res.message);
        this.sent.set(true);
      },
      // Even a rate-limit or server error shows the same confirmation, so
      // nothing about the address can be inferred from the outcome.
      error: () => {
        this.message.set('If that email belongs to an account, a reset link is on its way.');
        this.sent.set(true);
      },
    });
  }
}
