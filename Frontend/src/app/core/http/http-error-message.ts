import { HttpErrorResponse } from '@angular/common/http';
import { API_ERROR_CODES, type ApiErrorCode } from '@plano/common';
import { t } from '../i18n/translate';

export interface HttpErrorMessages {
  /** Fallback when no other rule applies. */
  fallback: string;
  /** Used for errors that are not HTTP responses (bugs, aborted streams); defaults to `fallback`. */
  unexpected?: string;
  /** Screen-specific wording for given status codes, checked before the server's code. */
  byStatus?: Readonly<Partial<Record<number, string>>>;
  /** Say what the API's `errorCode` means, when it sends a known one. */
  useServerCode?: boolean;
}

/**
 * The API's `errorCode`, when it is one this app knows. Its English `message`
 * is for developers and never shown.
 */
export function serverErrorCode(error: HttpErrorResponse): ApiErrorCode | null {
  const code = (error.error as { errorCode?: unknown } | null)?.errorCode;
  return (API_ERROR_CODES as readonly unknown[]).includes(code) ? (code as ApiErrorCode) : null;
}

/** Maps any error to a sentence in the interface language; the rules apply in the order of the options. */
export function httpErrorMessage(error: unknown, messages: HttpErrorMessages): string {
  if (!(error instanceof HttpErrorResponse)) return messages.unexpected ?? messages.fallback;
  if (error.status === 0) return t('errors.network');
  const forStatus = messages.byStatus?.[error.status];
  if (forStatus) return forStatus;
  const code = messages.useServerCode ? serverErrorCode(error) : null;
  return code ? t(`apiErrors.${code}`) : messages.fallback;
}
