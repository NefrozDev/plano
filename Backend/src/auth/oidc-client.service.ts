import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import * as oidc from 'openid-client';
import {
  type EndedSession,
  verifyAccountDeletion,
  verifyLogoutToken,
} from './identity-tokens';

/** What Plano keeps of a person from the identity service's ID token. */
export interface IdentityClaims {
  sub: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  locale: string | null;
  /** The identity session, for back-channel logouts. */
  sid: string | null;
}

/** The secrets of one sign-in, kept in a short-lived cookie until the callback. */
export interface SignInChecks {
  state: string;
  nonce: string;
  codeVerifier: string;
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (url[end - 1] === '/') end -= 1;
  return url.slice(0, end);
}

function claim(claims: Record<string, unknown>, name: string): string {
  const value = claims[name];
  if (typeof value !== 'string' || !value) {
    throw new Error(`The ID token has no ${name}.`);
  }
  return value;
}

/**
 * Plano as a client of the Synapse identity service (OpenID Connect): the
 * code flow with PKCE, the sign-out address, and the checks of what the
 * service sends back (logout tokens, deletion notices). Discovery is lazy and
 * retried, so the API starts even while the identity service is down.
 */
@Injectable()
export class OidcClientService {
  readonly issuer: string;
  readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly postLogoutRedirectUri: string;
  private discovery?: Promise<oidc.Configuration>;
  private keys?: JWTVerifyGetKey;

  constructor(config: ConfigService) {
    this.issuer = withoutTrailingSlashes(
      config.get<string>('OIDC_ISSUER') ?? 'http://localhost:4300/oidc',
    );
    this.clientId = config.get<string>('OIDC_CLIENT_ID') ?? 'plano';
    this.clientSecret =
      config.get<string>('OIDC_CLIENT_SECRET') ?? 'plano-development-secret';
    const frontendUrl = withoutTrailingSlashes(
      config.get<string>('FRONTEND_URL') ?? 'http://localhost:4200',
    );
    this.redirectUri = `${frontendUrl}/api/v1/auth/callback`;
    this.postLogoutRedirectUri = `${frontendUrl}/`;
  }

  newChecks(): SignInChecks {
    return {
      state: oidc.randomState(),
      nonce: oidc.randomNonce(),
      codeVerifier: oidc.randomPKCECodeVerifier(),
    };
  }

  /** Where to send the browser to sign in, in `locale` when given. */
  async authorizationUrl(
    checks: SignInChecks,
    locale?: string,
  ): Promise<string> {
    const config = await this.configuration();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: 'openid profile email',
      state: checks.state,
      nonce: checks.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(
        checks.codeVerifier,
      ),
      code_challenge_method: 'S256',
      ...(locale ? { ui_locales: locale } : {}),
    });
    return url.href;
  }

  /**
   * Exchanges the code the browser came back with, checking state, nonce,
   * PKCE and the ID token's signature, issuer and audience.
   */
  async signIn(
    query: Record<string, string>,
    checks: SignInChecks,
  ): Promise<IdentityClaims> {
    const config = await this.configuration();
    // Rebuilt from the registered address, never from the request's host.
    const callback = new URL(this.redirectUri);
    callback.search = new URLSearchParams(query).toString();
    const tokens = await oidc.authorizationCodeGrant(config, callback, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims() as Record<string, unknown> | undefined;
    if (!claims) throw new Error('The identity service sent no ID token.');
    return {
      sub: claim(claims, 'sub'),
      username: claim(claims, 'preferred_username'),
      firstName: claim(claims, 'given_name'),
      lastName: claim(claims, 'family_name'),
      email: claim(claims, 'email'),
      locale: typeof claims['locale'] === 'string' ? claims['locale'] : null,
      sid: typeof claims['sid'] === 'string' ? claims['sid'] : null,
    };
  }

  /** Where to send the browser once Plano's own session is gone: every app signs out. */
  async signOutUrl(): Promise<string> {
    const config = await this.configuration();
    return oidc.buildEndSessionUrl(config, {
      client_id: this.clientId,
      post_logout_redirect_uri: this.postLogoutRedirectUri,
    }).href;
  }

  async verifyLogoutToken(token: string): Promise<EndedSession> {
    return verifyLogoutToken(token, await this.keySet(), this.expectations());
  }

  /** The id of the account the notice says was deleted. */
  async verifyAccountDeletion(token: string): Promise<string> {
    return verifyAccountDeletion(
      token,
      await this.keySet(),
      this.expectations(),
    );
  }

  private expectations() {
    return { issuer: this.issuer, audience: this.clientId };
  }

  protected async keySet(): Promise<JWTVerifyGetKey> {
    if (!this.keys) {
      const jwksUri = (await this.configuration()).serverMetadata().jwks_uri;
      if (!jwksUri) throw new Error('The identity service publishes no keys.');
      // Cached, and fetched again when a token names an unknown key.
      this.keys = createRemoteJWKSet(new URL(jwksUri));
    }
    return this.keys;
  }

  protected configuration(): Promise<oidc.Configuration> {
    this.discovery ??= this.discover().catch((error: unknown) => {
      // Down for now: the next sign-in tries again.
      this.discovery = undefined;
      throw new ServiceUnavailableException(
        `The identity service cannot be reached: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    });
    return this.discovery;
  }

  private discover(): Promise<oidc.Configuration> {
    const issuer = new URL(this.issuer);
    return oidc.discovery(
      issuer,
      this.clientId,
      undefined,
      oidc.ClientSecretBasic(this.clientSecret),
      // Plain http is only for a local identity service.
      issuer.protocol === 'http:'
        ? { execute: [oidc.allowInsecureRequests] }
        : undefined,
    );
  }
}
