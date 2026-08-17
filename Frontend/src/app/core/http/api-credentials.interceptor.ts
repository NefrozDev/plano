import { HttpInterceptorFn } from '@angular/common/http';

export const apiCredentialsInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.url !== '/api' && !request.url.startsWith('/api/')) {
    return next(request);
  }

  return next(request.clone({ withCredentials: true }));
};
