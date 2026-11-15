export const SESSION_COOKIE_NAME = 'plano_session';
export const DEFAULT_SESSION_TTL_DAYS = 30;

/** Holds a sign-in's state, nonce and PKCE verifier until the callback. */
export const SIGN_IN_COOKIE_NAME = 'plano_sign_in';
export const SIGN_IN_COOKIE_MINUTES = 10;
/**
 * The sign-in cookie's value once a silent sign-in found no identity session:
 * for its 10 minutes, arriving again shows the sign-in page at once instead
 * of asking the identity service again.
 */
export const SILENT_SIGN_IN_TRIED = 'silent-tried';

const MINUTE_IN_MILLISECONDS = 60 * 1000;

/** Per client IP: each sign-in costs a call to the identity service. */
export const SIGN_IN_THROTTLE = {
  default: { limit: 20, ttl: MINUTE_IN_MILLISECONDS },
};
