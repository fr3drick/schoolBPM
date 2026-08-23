import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.user()) return router.createUrlTree(['/login']);
  if (auth.user()!.mustChangePassword && !state.url.startsWith('/change-password')) {
    return router.createUrlTree(['/change-password']);
  }
  // A school that registered itself has nothing to show until the platform
  // approves it, and the API refuses every school endpoint meanwhile. Send
  // its Super Admin somewhere that explains that instead of to a shell whose
  // every panel would fail to load.
  if (auth.schoolAwaitingReview() && !state.url.startsWith('/pending-approval')) {
    return router.createUrlTree(['/pending-approval']);
  }
  return true;
};

/** Keeps the waiting-room screen off the map once there is nothing to wait for. */
export const awaitingReviewGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.schoolAwaitingReview() ? true : router.createUrlTree(['/']);
};

/** Platform console routes: platform admins only. */
export const platformGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isPlatformAdmin() ? true : router.createUrlTree(['/']);
};

/** Route data: { perms: ['users.manage', ...] } — any match passes. */
export const permGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const perms: string[] = route.data['perms'] ?? [];
  return auth.hasAnyPerm(...perms) ? true : router.createUrlTree(['/']);
};
