import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { OidcClientService } from './../src/auth/oidc-client.service';
import { Session } from './../src/auth/session.entity';
import { List } from './../src/lists/entities/list.entity';
import { User } from './../src/users/user.entity';
import {
  type TestApp,
  cookiePair,
  createTestApp,
  readSetCookie,
  registerUser,
} from './e2e-helpers';
import { FakeIdentity, TEST_ISSUER } from './fake-identity';

describe('Signing in with the Synapse account (e2e)', () => {
  let testApp: TestApp;
  let identity: FakeIdentity;

  const http = () => request(testApp.app.getHttpServer());

  beforeEach(async () => {
    identity = await FakeIdentity.create();
    testApp = await createTestApp((builder) =>
      builder.overrideProvider(OidcClientService).useValue(identity),
    );
  });

  afterEach(() => testApp.close());

  /** Starts a sign-in and returns the cookie holding its checks, and its state. */
  async function startSignIn(returnTo?: string) {
    const response = await http()
      .get('/api/v1/auth/login')
      .query({ ...(returnTo ? { returnTo } : {}), lang: 'en' })
      .expect(303);
    const location = new URL(response.headers.location);
    const cookie = readSetCookie(response.headers).find((line) =>
      line.startsWith('plano_sign_in='),
    )!;
    return {
      location,
      setCookie: cookie,
      cookie: cookiePair(cookie),
      state: location.searchParams.get('state')!,
    };
  }

  it('sends the browser to the identity service with a state kept in a short-lived cookie', async () => {
    const { location, setCookie, state } = await startSignIn('/lists');

    expect(location.origin + location.pathname).toBe(`${TEST_ISSUER}/auth`);
    expect(location.searchParams.get('ui_locales')).toBe('en');
    expect(state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Max-Age=600/);
  });

  it('opens a Plano session on the way back and returns where the person was', async () => {
    const sub = randomUUID();
    identity.claims = {
      sub,
      username: 'Ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      locale: 'en',
      sid: 'sid-1',
    };
    const { cookie, state } = await startSignIn('/lists?tab=mine');

    const back = await http()
      .get('/api/v1/auth/callback')
      .query({ code: 'good', state })
      .set('Cookie', cookie)
      .expect(303);

    expect(back.headers.location).toBe('/lists?tab=mine');
    const cookies = readSetCookie(back.headers);
    expect(cookies.some((line) => line.startsWith('plano_sign_in=;'))).toBe(
      true,
    );
    const session = cookiePair(
      cookies.find((line) => line.startsWith('plano_session='))!,
    );
    const me = await http()
      .get('/api/v1/auth/session')
      .set('Cookie', session)
      .expect(200);
    expect(me.body).toEqual(
      expect.objectContaining({
        id: sub,
        username: 'ada',
        locale: 'en',
        termsAccepted: false,
      }),
    );
    // The checks came from this browser's cookie.
    expect(identity.signIns).toHaveLength(1);
    expect(identity.signIns[0].checks.state).toBe(state);
  });

  it('never returns to another site after signing in', async () => {
    identity.claims = {
      sub: randomUUID(),
      username: 'ada',
      firstName: 'Ada',
      lastName: 'L',
      email: 'ada@example.com',
      locale: null,
      sid: null,
    };
    for (const evil of [
      'https://evil.example/',
      '//evil.example',
      '/api/v1/groups',
    ]) {
      const { cookie, state } = await startSignIn(evil);

      const back = await http()
        .get('/api/v1/auth/callback')
        .query({ code: 'good', state })
        .set('Cookie', cookie)
        .expect(303);

      expect(back.headers.location).toBe('/');
    }
  });

  it("opens nothing without this browser's pending sign-in, or when the person went back", async () => {
    const { cookie, state } = await startSignIn();

    const noCookie = await http()
      .get('/api/v1/auth/callback')
      .query({ code: 'good', state })
      .expect(303);
    const cancelled = await http()
      .get('/api/v1/auth/callback')
      .query({ error: 'access_denied', state })
      .set('Cookie', cookie)
      .expect(303);

    expect(noCookie.headers.location).toBe('/login?signIn=cancelled');
    expect(cancelled.headers.location).toBe('/login?signIn=cancelled');
    expect(identity.signIns).toHaveLength(0);
    expect(
      readSetCookie(cancelled.headers).some((line) =>
        line.startsWith('plano_session='),
      ),
    ).toBe(false);
  });

  describe('silent sign-in on arrival', () => {
    async function startSilent(returnTo: string, cookie?: string) {
      const call = http()
        .get('/api/v1/auth/login')
        .query({ returnTo, lang: 'en', silent: '1' });
      if (cookie) void call.set('Cookie', cookie);
      return call.expect(303);
    }

    function signInCookie(headers: Record<string, unknown>) {
      return readSetCookie(headers).find((line) =>
        line.startsWith('plano_sign_in='),
      );
    }

    it('signs in at once when the Synapse session is open', async () => {
      identity.claims = {
        sub: randomUUID(),
        username: 'ada',
        firstName: 'Ada',
        lastName: 'L',
        email: 'ada@example.com',
        locale: null,
        sid: 'sid-1',
      };
      const start = await startSilent('/lists');
      const location = new URL(start.headers.location);
      const cookie = cookiePair(signInCookie(start.headers)!);

      const back = await http()
        .get('/api/v1/auth/callback')
        .query({ code: 'good', state: location.searchParams.get('state')! })
        .set('Cookie', cookie)
        .expect(303);

      expect(location.searchParams.get('prompt')).toBe('none');
      expect(back.headers.location).toBe('/lists');
      expect(
        readSetCookie(back.headers).some((line) =>
          line.startsWith('plano_session='),
        ),
      ).toBe(true);
      expect(identity.signIns).toHaveLength(1);
    });

    it('shows the sign-in page without a session, and does not ask again for 10 minutes', async () => {
      const start = await startSilent('/lists?tab=mine');
      const state = new URL(start.headers.location).searchParams.get('state')!;

      const back = await http()
        .get('/api/v1/auth/callback')
        .query({ error: 'login_required', state })
        .set('Cookie', cookiePair(signInCookie(start.headers)!))
        .expect(303);

      expect(back.headers.location).toBe(
        '/login?signIn=none&returnUrl=%2Flists%3Ftab%3Dmine',
      );
      const tried = signInCookie(back.headers)!;
      expect(tried).toMatch(/^plano_sign_in=silent-tried;/);
      expect(tried).toMatch(/Max-Age=600/);
      expect(tried).toMatch(/HttpOnly/i);
      expect(
        readSetCookie(back.headers).some((line) =>
          line.startsWith('plano_session='),
        ),
      ).toBe(false);
      expect(identity.signIns).toHaveLength(0);

      // Arriving again goes straight to the page, without the identity service.
      const again = await startSilent('/lists', cookiePair(tried));
      expect(again.headers.location).toBe(
        '/login?signIn=none&returnUrl=%2Flists',
      );
      expect(again.headers['set-cookie']).toBeUndefined();

      // The button still goes to the identity service, with its pages.
      const button = await http()
        .get('/api/v1/auth/login')
        .query({ returnTo: '/lists' })
        .set('Cookie', cookiePair(tried))
        .expect(303);
      const buttonLocation = new URL(button.headers.location);
      expect(buttonLocation.origin + buttonLocation.pathname).toBe(
        `${TEST_ISSUER}/auth`,
      );
      expect(buttonLocation.searchParams.has('prompt')).toBe(false);
    });

    it('never sends a silent sign-in back to another site', async () => {
      const start = await startSilent('//evil.example');
      const state = new URL(start.headers.location).searchParams.get('state')!;

      const back = await http()
        .get('/api/v1/auth/callback')
        .query({ error: 'login_required', state })
        .set('Cookie', cookiePair(signInCookie(start.headers)!))
        .expect(303);

      expect(back.headers.location).toBe('/login?signIn=none&returnUrl=%2F');
    });

    it('shows the sign-in page when the identity service is down, but reports it to the button', async () => {
      identity.down = true;

      const silent = await startSilent('/lists');
      const button = await http().get('/api/v1/auth/login').expect(500);

      expect(silent.headers.location).toBe(
        '/login?signIn=none&returnUrl=%2Flists',
      );
      expect(silent.headers['set-cookie']).toBeUndefined();
      expect(button.body).toEqual(expect.objectContaining({ statusCode: 500 }));
    });
  });

  it('reports a failed exchange without opening a session', async () => {
    const { cookie, state } = await startSignIn();

    const back = await http()
      .get('/api/v1/auth/callback')
      .query({ code: 'forged', state })
      .set('Cookie', cookie)
      .expect(303);

    expect(back.headers.location).toBe('/login?signIn=failed');
    expect(identity.signIns).toHaveLength(1);
    expect(await testApp.app.get(DataSource).manager.count(Session)).toBe(0);
  });

  it('signs out of Plano, then hands the browser to the identity service', async () => {
    const ada = await registerUser(testApp.app, 'ada');

    const response = await http()
      .post('/api/v1/auth/logout')
      .set('Cookie', ada.cookie)
      .expect(200);

    expect(response.body).toEqual({
      redirectTo: `${TEST_ISSUER}/session/end?client_id=plano`,
    });
    expect(readSetCookie(response.headers)[0]).toContain('plano_session=;');
    await http()
      .get('/api/v1/auth/session')
      .set('Cookie', ada.cookie)
      .expect(401);
  });

  describe('back-channel logout', () => {
    it('ends the Plano sessions opened from the identity session that ended', async () => {
      const fromA = await registerUser(testApp.app, 'ada', { sid: 'sid-a' });
      const fromB = await registerUser(testApp.app, 'bob', { sid: 'sid-b' });

      await http()
        .post('/api/v1/auth/backchannel-logout')
        .type('form')
        .send({ logout_token: await identity.logoutToken({ sid: 'sid-a' }) })
        .expect(200);

      await http()
        .get('/api/v1/auth/session')
        .set('Cookie', fromA.cookie)
        .expect(401);
      await http()
        .get('/api/v1/auth/session')
        .set('Cookie', fromB.cookie)
        .expect(200);
    });

    it('refuses a token for another app, or none, and ends nothing', async () => {
      const ada = await registerUser(testApp.app, 'ada', { sid: 'sid-a' });

      const forged = await http()
        .post('/api/v1/auth/backchannel-logout')
        .type('form')
        .send({
          logout_token: await identity.logoutToken({ sid: 'sid-a' }, 'erudi'),
        })
        .expect(400);
      await http()
        .post('/api/v1/auth/backchannel-logout')
        .type('form')
        .send({})
        .expect(400);

      expect((forged.body as { message: string }).message).toBe(
        'Invalid logout token',
      );
      await http()
        .get('/api/v1/auth/session')
        .set('Cookie', ada.cookie)
        .expect(200);
    });
  });

  describe('account deletion', () => {
    async function ownedList(ownerId: string): Promise<void> {
      await testApp.app.get(DataSource).manager.insert(List, {
        id: randomUUID(),
        ownerId,
        name: 'Courses',
        icon: 'cart',
        color: '#123456',
      });
    }

    it('erases the account and what it owns in Plano', async () => {
      const ada = await registerUser(testApp.app, 'ada');
      const bob = await registerUser(testApp.app, 'bob');
      await ownedList(ada.user.id);
      await ownedList(bob.user.id);

      await http()
        .post('/api/v1/auth/account-deleted')
        .set('Content-Type', 'application/secevent+jwt')
        .send(await identity.deletionNotice(ada.user.id))
        .expect(204);

      const manager = testApp.app.get(DataSource).manager;
      expect(await manager.countBy(User, { id: ada.user.id })).toBe(0);
      expect(await manager.countBy(List, { ownerId: ada.user.id })).toBe(0);
      expect(await manager.countBy(List, { ownerId: bob.user.id })).toBe(1);
      await http()
        .get('/api/v1/auth/session')
        .set('Cookie', ada.cookie)
        .expect(401);
    });

    it('refuses a notice for another app or a logout token, and erases nothing', async () => {
      const ada = await registerUser(testApp.app, 'ada');

      for (const token of [
        await identity.deletionNotice(ada.user.id, 'erudi'),
        await identity.logoutToken({ sub: ada.user.id }),
      ]) {
        await http()
          .post('/api/v1/auth/account-deleted')
          .set('Content-Type', 'application/secevent+jwt')
          .send(token)
          .expect(400);
      }

      expect(
        await testApp.app.get(DataSource).manager.countBy(User, {
          id: ada.user.id,
        }),
      ).toBe(1);
    });
  });
});
