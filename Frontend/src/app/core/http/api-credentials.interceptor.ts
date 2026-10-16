import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from './api-base-url';

/** Sends the session cookie with every API request, and only with those. */
export const apiCredentialsInterceptor: HttpInterceptorFn = (request, next) => {
  const apiUrl = inject(API_BASE_URL);
  if (request.url !== apiUrl && !request.url.startsWith(`${apiUrl}/`)) {
    return next(request);
  }

  return next(request.clone({ withCredentials: true }));
};
