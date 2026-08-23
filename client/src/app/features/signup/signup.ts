import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, interval } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/auth.interceptor';

type Step = 'account' | 'verify' | 'school' | 'done';

/** Survives a page refresh mid-registration; cleared once the school is in. */
const RESUME_KEY = 'sbpm_signup';
interface Resume {
  step: Step;
  email: string;
  signupToken?: string;
  codeExpiresAt?: number;
}

/**
 * Public registration for a school.
 *
 * Deliberately signposted throughout as the owner/administrator route: staff
 * accounts are created by their own school, and someone who registers a second
 * copy of a school that already exists on the platform cannot be undone by
 * self-service.
 */
@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule, RouterLink, MatCardModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <div class="wrap">
      <mat-card class="card">
        @if (step() === 'done') {
          <div class="head">
            <mat-icon class="logo ok">how_to_reg</mat-icon>
            <h1>Registration submitted</h1>
            <p class="muted">{{ doneMessage() }}</p>
          </div>
          <div class="next">
            <div class="next-title">What happens now</div>
            <ol>
              <li>Our team reviews your school — usually within one business day.</li>
              <li>You get an email the moment it is approved.</li>
              <li>Sign in and invite your staff from <b>Administration &rarr; Users</b>.</li>
            </ol>
          </div>
          <a mat-flat-button color="primary" class="full" routerLink="/login">Go to sign in</a>
        } @else {
          <div class="head">
            <mat-icon class="logo">add_business</mat-icon>
            <h1>Register your school</h1>
            <p class="role-note">
              <mat-icon inline>badge</mat-icon>
              For school owners and administrators
            </p>
          </div>

          <div class="steps" role="list">
            @for (s of stepLabels; track s.key; let i = $index) {
              <div class="step" role="listitem"
                   [class.current]="s.key === step()" [class.past]="stepIndex() > i">
                <span class="dot">
                  @if (stepIndex() > i) { <mat-icon>check</mat-icon> } @else { {{ i + 1 }} }
                </span>
                <span class="step-label">{{ s.label }}</span>
              </div>
            }
          </div>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          @switch (step()) {
            @case ('account') {
              <p class="lede">
                This creates the <b>Super Admin</b> account for your school — the account that
                manages users and roles once your school is approved.
              </p>
              <form [formGroup]="accountForm" (ngSubmit)="submitAccount()">
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Your full name</mat-label>
                  <input matInput formControlName="name" autocomplete="name" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Your work email</mat-label>
                  <input matInput type="email" formControlName="email" autocomplete="username" />
                  <mat-hint>We send a verification code here</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Choose a password</mat-label>
                  <input matInput type="password" formControlName="password" autocomplete="new-password" />
                  <mat-hint>At least 8 characters</mat-hint>
                </mat-form-field>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Confirm password</mat-label>
                  <input matInput type="password" formControlName="confirm" autocomplete="new-password" />
                </mat-form-field>
                <button mat-flat-button color="primary" class="full" type="submit"
                        [disabled]="accountForm.invalid || busy()">
                  {{ busy() ? 'Sending code…' : 'Create account' }}
                </button>
              </form>
              <p class="staff-note">
                Not a school owner or administrator? Teachers and other staff do not register
                here — ask your school's administrator to add you, and you will get sign-in
                details by email.
              </p>
            }

            @case ('verify') {
              <p class="lede">
                We sent a six-digit code to <b>{{ email() }}</b>. Enter it below to confirm the
                address is yours.
              </p>
              <form [formGroup]="verifyForm" (ngSubmit)="submitCode()">
                <mat-form-field appearance="outline" class="full code">
                  <mat-label>Verification code</mat-label>
                  <input matInput formControlName="code" inputmode="numeric" maxlength="6"
                         autocomplete="one-time-code" placeholder="000000" />
                </mat-form-field>
                <div class="countdown" [class.expired]="expired()">
                  <mat-icon inline>{{ expired() ? 'timer_off' : 'schedule' }}</mat-icon>
                  {{ expired() ? 'This code has expired — ask for a new one.' : 'Code expires in ' + remaining() }}
                </div>
                <button mat-flat-button color="primary" class="full" type="submit"
                        [disabled]="verifyForm.invalid || busy()">
                  {{ busy() ? 'Checking…' : 'Verify email' }}
                </button>
              </form>
              <div class="resend">
                @if (resent()) { <span class="sent">{{ resent() }}</span> }
                <button mat-button type="button" [disabled]="busy()" (click)="resend()">
                  Send a new code
                </button>
                <button mat-button type="button" (click)="backToAccount()">Use a different email</button>
              </div>
            }

            @case ('school') {
              <p class="lede">
                Now tell us about your school. Our team checks these details before your school
                goes live.
              </p>
              <form [formGroup]="schoolForm" (ngSubmit)="submitSchool()">
                <mat-form-field appearance="outline" class="full">
                  <mat-label>School name</mat-label>
                  <input matInput formControlName="name" placeholder="e.g. Green Valley Academy" />
                </mat-form-field>
                <div class="row">
                  <mat-form-field appearance="outline">
                    <mat-label>School contact email</mat-label>
                    <input matInput type="email" formControlName="contactEmail" />
                    <mat-hint>Used as the reply-to address</mat-hint>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>School phone number</mat-label>
                    <input matInput formControlName="contactPhone" />
                  </mat-form-field>
                </div>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Street address</mat-label>
                  <input matInput formControlName="address" />
                </mat-form-field>
                <div class="row">
                  <mat-form-field appearance="outline">
                    <mat-label>Town or city</mat-label>
                    <input matInput formControlName="city" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>State or region</mat-label>
                    <input matInput formControlName="state" />
                  </mat-form-field>
                </div>
                <div class="row">
                  <mat-form-field appearance="outline">
                    <mat-label>Country</mat-label>
                    <input matInput formControlName="country" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Number of staff</mat-label>
                    <input matInput type="number" formControlName="staffCount" min="0" />
                    <mat-hint>Approximate is fine — optional</mat-hint>
                  </mat-form-field>
                </div>
                <mat-form-field appearance="outline" class="full">
                  <mat-label>Website</mat-label>
                  <input matInput formControlName="website" placeholder="Optional" />
                </mat-form-field>
                <button mat-flat-button color="primary" class="full" type="submit"
                        [disabled]="schoolForm.invalid || busy()">
                  {{ busy() ? 'Submitting…' : 'Submit for approval' }}
                </button>
              </form>
            }
          }

          <div class="back"><a routerLink="/login">Already have an account? Sign in</a></div>
        }
      </mat-card>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(160deg, #e3f2fd, #f6f7f9 60%); padding: 16px; }
    .card { width: 100%; max-width: 560px; padding: 32px; }
    .head { text-align: center; margin-bottom: 20px; }
    .logo { font-size: 44px; width: 44px; height: 44px; color: #1565c0; }
    .logo.ok { color: #2e7d32; }
    h1 { margin: 8px 0 4px; font-size: 22px; }
    p { margin: 0; }
    .role-note {
      display: inline-flex; align-items: center; gap: 6px; margin-top: 6px;
      background: #e3f2fd; color: #1565c0; border-radius: 12px;
      padding: 4px 12px; font-size: 12px; font-weight: 500;
    }
    .steps { display: flex; gap: 8px; margin: 4px 0 20px; }
    .step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; color: #90a4ae; font-size: 11px; text-align: center; }
    .step .dot {
      width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
      background: #eceff1; color: #90a4ae; font-size: 12px; font-weight: 600;
    }
    .step .dot mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .step.current .dot { background: #1565c0; color: #fff; }
    .step.current .step-label { color: #1565c0; font-weight: 600; }
    .step.past .dot { background: #2e7d32; color: #fff; }
    .lede { font-size: 14px; color: #546e7a; line-height: 1.5; margin-bottom: 18px; }
    .full { width: 100%; }
    /* Material packs the hint flush against the field box, so a filled field
       below floats its label straight into it. A little rhythm keeps them apart. */
    mat-form-field { margin-bottom: 12px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
    .row mat-form-field { width: 100%; }
    .code input { font-family: Consolas, Menlo, monospace; font-size: 22px; letter-spacing: 10px; text-align: center; }
    .countdown { font-size: 12px; color: #78909c; display: flex; align-items: center; gap: 6px; margin: -8px 0 16px; }
    .countdown.expired { color: #b26a00; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
    button.full, a.full { height: 44px; }
    .resend { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 10px; font-size: 13px; }
    .resend .sent { color: #2e7d32; margin-right: 4px; }
    .staff-note { font-size: 12px; color: #78909c; line-height: 1.5; margin-top: 18px; border-top: 1px solid #eceff1; padding-top: 14px; }
    .next { background: #f6f7f9; border-radius: 8px; padding: 16px 18px; margin-bottom: 20px; }
    .next-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: #90a4ae; margin-bottom: 8px; }
    .next ol { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.7; color: #37474f; }
    .back { text-align: center; margin-top: 18px; font-size: 13px; }
    .back a { color: #1565c0; text-decoration: none; }
    .back a:hover { text-decoration: underline; }
    @media (max-width: 520px) { .row { grid-template-columns: 1fr; } }
  `,
})
export class SignupComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  readonly stepLabels = [
    { key: 'account', label: 'Your details' },
    { key: 'verify', label: 'Verify email' },
    { key: 'school', label: 'Your school' },
  ] as const;

  step = signal<Step>('account');
  email = signal('');
  busy = signal(false);
  error = signal('');
  resent = signal('');
  doneMessage = signal('');

  private signupToken = signal('');
  private codeExpiresAt = signal(0);
  private now = signal(Date.now());

  stepIndex = computed(() => this.stepLabels.findIndex((s) => s.key === this.step()));
  expired = computed(() => this.codeExpiresAt() > 0 && this.now() >= this.codeExpiresAt());
  /** mm:ss until the emailed code stops working. */
  remaining = computed(() => {
    const ms = Math.max(this.codeExpiresAt() - this.now(), 0);
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  });

  accountForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', Validators.required],
  });

  verifyForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  schoolForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    contactEmail: ['', [Validators.required, Validators.email]],
    contactPhone: ['', Validators.required],
    address: ['', Validators.required],
    city: ['', Validators.required],
    state: [''],
    country: ['', Validators.required],
    website: [''],
    staffCount: [null as number | null],
  });

  constructor() {
    this.restore();
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
  }

  submitAccount() {
    const { name, email, password, confirm } = this.accountForm.getRawValue();
    if (password !== confirm) {
      this.error.set('Password and confirmation do not match');
      return;
    }
    this.run(this.api.startSignup({ name, email, password }), (res) => {
      this.email.set(res.email);
      this.startCountdown(res.ttlMinutes);
      this.go('verify');
    });
  }

  submitCode() {
    this.run(
      this.api.verifySignupCode(this.email(), this.verifyForm.getRawValue().code),
      (res) => {
        this.signupToken.set(res.signupToken);
        this.go('school');
      }
    );
  }

  resend() {
    this.resent.set('');
    this.run(this.api.resendSignupCode(this.email()), (res) => {
      this.startCountdown(res.ttlMinutes);
      this.verifyForm.reset();
      this.resent.set('Sent.');
    });
  }

  submitSchool() {
    const raw = this.schoolForm.getRawValue();
    this.run(
      this.api.registerSchool(this.signupToken(), {
        ...raw,
        staffCount: raw.staffCount === null || String(raw.staffCount) === '' ? null : Number(raw.staffCount),
      }),
      (res) => {
        this.doneMessage.set(res.message);
        sessionStorage.removeItem(RESUME_KEY);
        this.step.set('done');
      }
    );
  }

  /** Starting over with another address abandons the code already sent. */
  backToAccount() {
    sessionStorage.removeItem(RESUME_KEY);
    this.error.set('');
    this.resent.set('');
    this.codeExpiresAt.set(0);
    this.verifyForm.reset();
    this.step.set('account');
  }

  /** One place for the busy flag and error banner every step shares. */
  private run<T>(source: Observable<T>, ok: (value: T) => void) {
    this.busy.set(true);
    this.error.set('');
    source.subscribe({
      next: (value) => {
        this.busy.set(false);
        ok(value);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  private startCountdown(ttlMinutes: number) {
    this.codeExpiresAt.set(Date.now() + ttlMinutes * 60 * 1000);
    this.now.set(Date.now());
  }

  private go(step: Step) {
    this.step.set(step);
    this.resent.set('');
    this.persist();
  }

  private persist() {
    const state: Resume = {
      step: this.step(),
      email: this.email(),
      signupToken: this.signupToken() || undefined,
      codeExpiresAt: this.codeExpiresAt() || undefined,
    };
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(state));
  }

  /**
   * Picks a half-finished registration back up after a refresh. Only the step
   * and the token are restored — never the password, which is not written
   * anywhere on this machine.
   */
  private restore() {
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as Resume;
      if (state.step !== 'verify' && state.step !== 'school') return;
      if (state.step === 'school' && !state.signupToken) return;
      this.email.set(state.email || '');
      this.signupToken.set(state.signupToken || '');
      this.codeExpiresAt.set(state.codeExpiresAt || 0);
      this.step.set(state.step);
    } catch {
      sessionStorage.removeItem(RESUME_KEY);
    }
  }
}
