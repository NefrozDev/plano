import { HttpErrorResponse } from '@angular/common/http';

export const NETWORK_ERROR_MESSAGE = 'Impossible de joindre Plano. Vérifiez votre connexion.';
export const UNEXPECTED_ERROR_MESSAGE = 'Une erreur inattendue est survenue. Veuillez réessayer.';
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Trop de tentatives. Réessayez dans quelques minutes.';

export interface HttpErrorMessages {
  /** Fallback when no other rule applies. */
  fallback: string;
  /** Used for errors that are not HTTP responses (bugs, aborted streams); defaults to `fallback`. */
  unexpected?: string;
  /** Screen-specific wording for given status codes, checked before the server message. */
  byStatus?: Readonly<Partial<Record<number, string>>>;
  /** Show the API's own (already localized) message when it sends one. */
  useServerMessage?: boolean;
}

/** The API's `message` field: a string, or an array of validation messages. */
export function serverMessage(error: HttpErrorResponse): string {
  const message = (error.error as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join(' ');
  return typeof message === 'string' ? message : '';
}

/** Maps any error to a user-facing sentence; the rules apply in the order of the options. */
export function httpErrorMessage(error: unknown, messages: HttpErrorMessages): string {
  if (!(error instanceof HttpErrorResponse)) return messages.unexpected ?? messages.fallback;
  if (error.status === 0) return NETWORK_ERROR_MESSAGE;
  const forStatus = messages.byStatus?.[error.status];
  if (forStatus) return forStatus;
  const fromServer = messages.useServerMessage ? serverMessage(error) : '';
  return fromServer || messages.fallback;
}
