import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Signed in, and Plano's own terms accepted: someone coming from another
 * Synapse app accepted the account's terms only, so the welcome screen asks.
 */
export const authenticatedGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.restoreSession().pipe(
    map((user) => {
      if (!user) {
        return router.createUrlTree(['/login'], {
          queryParams: { returnUrl: state.url },
        });
      }
      return user.termsAccepted
        ? true
        : router.createUrlTree(['/welcome'], {
            queryParams: { returnUrl: state.url },
          });
    }),
  );
};

/** Signed in, terms accepted or not: the welcome screen itself. */
export const signedInGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth
    .restoreSession()
    .pipe(map((user) => (user ? true : router.createUrlTree(['/login']))));
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth
    .restoreSession()
    .pipe(map((user) => (user ? router.createUrlTree(['/']) : true)));
};
