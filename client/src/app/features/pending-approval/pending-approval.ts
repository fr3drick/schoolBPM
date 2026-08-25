import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * Where a Super Admin lands while their school is under review, and where
 * they are told if it was turned down.
 *
 * The API refuses every school-scoped endpoint in this state, so there is
 * nothing to load here — the screen reads entirely from the profile.
 */
@Component({
  selector: 'app-pending-approval',
  imports: [DatePipe, MatCardModule, MatButtonModule, MatIconModule],
  template: `
    <div class="wrap">
      <mat-card class="card">
        @if (rejected()) {
          <div class="head">
            <mat-icon class="logo bad">report</mat-icon>
            <h1>{{ school()?.name }} was not approved</h1>
            <p class="muted">Your registration was reviewed and could not be approved.</p>
          </div>
          @if (school()?.rejectionReason) {
            <div class="reason">
              <div class="reason-title">Reason given</div>
              {{ school()?.rejectionReason }}
            </div>
          }
          <p class="hint">
            Your account still exists, so nothing needs to be created again if this is resolved.
            Reply to the email we sent you, or contact the platform team, and they can take
            another look.
          </p>
        } @else {
          <div class="head">
            <mat-icon class="logo">hourglass_top</mat-icon>
            <h1>{{ school()?.name }} is awaiting approval</h1>
            <p class="muted">
              Your school has been registered and is with our team for review — usually within
              one business day.
            </p>
          </div>

          <div class="timeline">
            <div class="node done">
              <mat-icon>check_circle</mat-icon>
              <div>
                <b>Email verified</b>
                <div class="muted">{{ user()?.email }}</div>
              </div>
            </div>
            <div class="node done">
              <mat-icon>check_circle</mat-icon>
              <div>
                <b>School submitted</b>
                @if (school()?.submittedAt) {
                  <div class="muted">{{ school()?.submittedAt | date: 'MMM d, y, h:mm a' }}</div>
                }
              </div>
            </div>
            <div class="node current">
              <mat-icon>hourglass_top</mat-icon>
              <div>
                <b>Platform review</b>
                <div class="muted">In progress — we will email you when it is done</div>
              </div>
            </div>
            <div class="node">
              <mat-icon>radio_button_unchecked</mat-icon>
              <div>
                <b>Invite your staff</b>
                <div class="muted">Unlocks once your school is approved</div>
              </div>
            </div>
          </div>

          <p class="hint">
            Nothing else is available until then — requests, users and roles all belong to an
            approved school. You do not need to keep this page open.
          </p>
        }

        <div class="actions">
          <button mat-button (click)="auth.logout()">Sign out</button>
          <button mat-flat-button color="primary" [disabled]="checking()" (click)="check()">
            <mat-icon>refresh</mat-icon>
            {{ checking() ? 'Checking…' : 'Check again' }}
          </button>
        </div>
        @if (message()) {
          <div class="note">{{ message() }}</div>
        }
      </mat-card>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(160deg, #e3f2fd, #f6f7f9 60%); padding: 16px; }
    .card { width: 100%; max-width: 520px; padding: 32px; }
    .head { text-align: center; margin-bottom: 22px; }
    .logo { font-size: 44px; width: 44px; height: 44px; color: #1565c0; }
    .logo.bad { color: #c62828; }
    h1 { margin: 8px 0 6px; font-size: 21px; }
    p { margin: 0; }
    .muted { color: #78909c; font-size: 13px; line-height: 1.5; }
    .timeline { display: flex; flex-direction: column; gap: 14px; background: #f6f7f9; border-radius: 8px; padding: 18px; }
    .node { display: flex; gap: 12px; align-items: flex-start; color: #90a4ae; }
    .node b { font-size: 14px; font-weight: 500; color: #90a4ae; }
    .node.done, .node.done b { color: #2e7d32; }
    .node.current, .node.current b { color: #1565c0; }
    .node mat-icon { font-size: 20px; width: 20px; height: 20px; margin-top: 1px; }
    .reason { background: #ffebee; color: #8e2020; border-radius: 8px; padding: 14px 16px; font-size: 14px; line-height: 1.5; }
    .reason-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; margin-bottom: 4px; }
    .hint { font-size: 13px; color: #637381; line-height: 1.5; margin-top: 18px; }
    .actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 24px; }
    .note { text-align: center; font-size: 13px; color: #546e7a; margin-top: 12px; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingApprovalComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);

  checking = signal(false);
  message = signal('');

  user = computed(() => this.auth.user());
  school = computed(() => this.auth.user()?.school ?? null);
  rejected = computed(() => this.school()?.status === 'rejected');

  /** Re-reads the profile so an approval that landed meanwhile takes effect. */
  async check() {
    this.checking.set(true);
    this.message.set('');
    try {
      await this.auth.refresh();
      if (!this.auth.schoolAwaitingReview()) {
        await this.router.navigate(['/']);
        return;
      }
      this.message.set(
        this.rejected() ? 'The decision has not changed.' : 'Still under review — we will email you.'
      );
    } catch {
      this.message.set('Could not reach the server. Try again in a moment.');
    } finally {
      this.checking.set(false);
    }
  }
}
