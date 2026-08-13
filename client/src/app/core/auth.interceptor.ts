import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401 && !req.url.includes('/auth/login')) auth.logout();
      return throwError(() => err);
    })
  );
};

/** Pulls the server's error message out of an HttpErrorResponse. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    return err.error?.error || err.message || 'Something went wrong';
  }
  return 'Something went wrong';
}
