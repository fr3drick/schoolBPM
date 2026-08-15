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
  return true;
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
