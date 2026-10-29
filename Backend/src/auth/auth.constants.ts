export const SESSION_COOKIE_NAME = 'plano_session';
export const DEFAULT_SESSION_TTL_DAYS = 30;

const MINUTE_IN_MILLISECONDS = 60 * 1000;

/** Per client IP: slows password guessing without hindering a real user. */
export const LOGIN_THROTTLE = {
  default: { limit: 10, ttl: MINUTE_IN_MILLISECONDS },
};

/** Per client IP: each request may send an e-mail, so keep it low. */
export const PASSWORD_RESET_THROTTLE = {
  default: { limit: 5, ttl: 15 * MINUTE_IN_MILLISECONDS },
};

/** Per client IP: a token is unguessable, this only bounds wasted work. */
export const PASSWORD_RESET_CONFIRM_THROTTLE = {
  default: { limit: 10, ttl: 15 * MINUTE_IN_MILLISECONDS },
};

/** Per client IP: limits scripted account creation. */
export const REGISTER_THROTTLE = {
  default: { limit: 10, ttl: 15 * MINUTE_IN_MILLISECONDS },
};
