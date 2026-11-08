import { ConfigService } from '@nestjs/config';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';
import { ACCOUNT_DELETED_EVENT } from '../src/auth/identity-tokens';
import {
  type IdentityClaims,
  OidcClientService,
  type SignInChecks,
} from '../src/auth/oidc-client.service';

/** The issuer the tests configure; nothing listens there. */
export const TEST_ISSUER = 'https://auth.test/oidc';
const LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/**
 * Stands in for the Synapse identity service: the real token checks run
 * against a key made for the test, and a sign-in succeeds for the code
 * `good` with the claims the test chose.
 */
export class FakeIdentity extends OidcClientService {
  claims: IdentityClaims | null = null;
  readonly signIns: { query: Record<string, string>; checks: SignInChecks }[] =
    [];

  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly publicKeys: JWTVerifyGetKey,
  ) {
    super(
      new ConfigService({
        OIDC_ISSUER: TEST_ISSUER,
        OIDC_CLIENT_ID: 'plano',
        FRONTEND_URL: 'https://plano.test',
      }),
    );
  }

  static async create(): Promise<FakeIdentity> {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' };
    return new FakeIdentity(privateKey, createLocalJWKSet({ keys: [jwk] }));
  }

  override authorizationUrl(
    checks: SignInChecks,
    locale?: string,
  ): Promise<string> {
    const url = new URL(`${TEST_ISSUER}/auth`);
    url.searchParams.set('state', checks.state);
    if (locale) url.searchParams.set('ui_locales', locale);
    return Promise.resolve(url.href);
  }

  override signIn(
    query: Record<string, string>,
    checks: SignInChecks,
  ): Promise<IdentityClaims> {
    this.signIns.push({ query, checks });
    if (query['code'] !== 'good' || query['state'] !== checks.state) {
      return Promise.reject(new Error('state mismatch or bad code'));
    }
    if (!this.claims) return Promise.reject(new Error('no claims set'));
    return Promise.resolve(this.claims);
  }

  override signOutUrl(): Promise<string> {
    return Promise.resolve(`${TEST_ISSUER}/session/end?client_id=plano`);
  }

  protected override keySet(): Promise<JWTVerifyGetKey> {
    return Promise.resolve(this.publicKeys);
  }

  /** A logout token as the identity service signs it; `audience` to forge one. */
  logoutToken(ended: { sub?: string; sid?: string }, audience = 'plano') {
    return this.sign({ ...ended, events: { [LOGOUT_EVENT]: {} } }, audience);
  }

  deletionNotice(sub: string, audience = 'plano') {
    return this.sign(
      { sub, events: { [ACCOUNT_DELETED_EVENT]: {} } },
      audience,
      'secevent+jwt',
    );
  }

  private sign(
    claims: Record<string, unknown>,
    audience: string,
    typ?: string,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test', typ })
      .setIssuer(TEST_ISSUER)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti(crypto.randomUUID())
      .sign(this.privateKey);
  }
}
