import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UserProfile } from './models';

const TOKEN_KEY = 'sbpm_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly user = signal<UserProfile | null>(null);

  token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /** Replaces the stored session token, e.g. after a password change. */
  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  }

  /** Runs before the router starts (app initializer): restores the session. */
  async restore(): Promise<void> {
    if (!this.token()) return;
    try {
      const res = await firstValueFrom(this.http.get<{ user: UserProfile }>('/api/auth/me'));
      this.user.set(res.user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  login(email: string, password: string) {
    return this.http
      .post<{ token: string; user: UserProfile }>('/api/auth/login', { email, password })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.token);
          this.user.set(res.user);
        })
      );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.user.set(null);
    this.router.navigate(['/login']);
  }

  isPlatformAdmin(): boolean {
    return this.user()?.isPlatformAdmin ?? false;
  }

  /**
   * True while the signed-in user's school is pending or was rejected.
   * Platform staff hold no school, so they are never in this state, and a
   * school predating self-onboarding reports no status at all — treat the
   * absence as approved rather than locking existing tenants out.
   */
  schoolAwaitingReview(): boolean {
    const status = this.user()?.school?.status;
    return Boolean(status) && status !== 'approved';
  }

  /** Re-reads the profile, e.g. to notice an approval that landed since sign-in. */
  async refresh(): Promise<void> {
    const res = await firstValueFrom(this.http.get<{ user: UserProfile }>('/api/auth/me'));
    this.user.set(res.user);
  }

  hasPerm(perm: string): boolean {
    return this.user()?.role?.permissions?.includes(perm) ?? false;
  }

  hasAnyPerm(...perms: string[]): boolean {
    return perms.some((p) => this.hasPerm(p));
  }
}
