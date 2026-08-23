import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/auth.interceptor';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="wrap">
      <mat-card class="card">
        <div class="head">
          <mat-icon class="logo">school</mat-icon>
          <h1>IdeaVerge School BPM</h1>
          <p class="muted">Sign in to manage your school's processes</p>
        </div>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="username" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Password</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="current-password" />
          </mat-form-field>
          @if (error()) {
            <div class="error">{{ error() }}</div>
          }
          <button mat-flat-button color="primary" class="full" type="submit" [disabled]="form.invalid || busy()">
            {{ busy() ? 'Signing in…' : 'Sign in' }}
          </button>
          <div class="forgot">
            <a routerLink="/forgot-password">Forgot your password?</a>
          </div>
        </form>
      </mat-card>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(160deg, #e3f2fd, #f6f7f9 60%); padding: 16px; }
    .card { width: 100%; max-width: 400px; padding: 32px; }
    .head { text-align: center; margin-bottom: 20px; }
    .logo { font-size: 44px; width: 44px; height: 44px; color: #1565c0; }
    h1 { margin: 8px 0 4px; font-size: 22px; }
    p { margin: 0; }
    .full { width: 100%; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
    button.full { height: 44px; }
    .forgot { text-align: center; margin-top: 16px; font-size: 13px; }
    .forgot a { color: #1565c0; text-decoration: none; }
    .forgot a:hover { text-decoration: underline; }
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  busy = signal(false);
  error = signal('');

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: (res) => {
        this.router.navigate([res.user.mustChangePassword ? '/change-password' : '/']);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
