export const SESSION_COOKIE_NAME = 'plano_session';
export const DEFAULT_SESSION_TTL_DAYS = 30;

/** Holds a sign-in's state, nonce and PKCE verifier until the callback. */
export const SIGN_IN_COOKIE_NAME = 'plano_sign_in';
export const SIGN_IN_COOKIE_MINUTES = 10;

const MINUTE_IN_MILLISECONDS = 60 * 1000;

/** Per client IP: each sign-in costs a call to the identity service. */
export const SIGN_IN_THROTTLE = {
  default: { limit: 20, ttl: MINUTE_IN_MILLISECONDS },
};
