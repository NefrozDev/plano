import request from 'supertest';
import { MailService, type OutgoingMail } from './../src/mail/mail.service';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
  validRegistration,
} from './e2e-helpers';

describe('Password recovery (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;
  let sent: OutgoingMail[];

  const http = () => request(testApp.app.getHttpServer());
  /** The token of the last e-mail, read from its link. */
  const lastToken = async (): Promise<string> => {
    await vi.waitFor(() => expect(sent.length).toBeGreaterThan(0));
    return /#token=([A-Za-z0-9_-]{43})/.exec(sent.at(-1)!.text)![1];
  };

  beforeEach(async () => {
    sent = [];
    testApp = await createTestApp((builder) =>
      builder.overrideProvider(MailService).useValue({
        enabled: true,
        send: (mail: OutgoingMail) => {
          sent.push(mail);
          return Promise.resolve();
        },
      }),
    );
    ada = await registerUser(testApp.app, 'ada');
  });

  afterEach(() => testApp.close());

  it('e-mails a link that sets a new password once and signs out everywhere', async () => {
    await http()
      .post('/api/v1/auth/password-reset')
      .send({ email: 'ADA@example.com' })
      .expect(204);
    const token = await lastToken();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ada@example.com');
    expect(sent[0].text).toContain(`/reset-password#token=${token}`);

    await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'brand-new-password' })
      .expect(204);

    // The old session is gone, the old password too; the new one works.
    await http()
      .get('/api/v1/auth/session')
      .set('Cookie', ada.cookie)
      .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ username: 'ada', password: validRegistration.password })
      .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ username: 'ada', password: 'brand-new-password' })
      .expect(200);
    const reused = await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'yet-another-password' })
      .expect(400);
    expect((reused.body as { message: string }).message).toBe(
      'Ce lien n’est plus valable. Demandez-en un nouveau.',
    );
  });

  it('answers an unknown address exactly like a known one, sending nothing', async () => {
    const response = await http()
      .post('/api/v1/auth/password-reset')
      .send({ email: 'nobody@example.com' })
      .expect(204);

    expect(response.text).toBe('');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toEqual([]);
  });

  it('validates both requests', async () => {
    for (const body of [
      {},
      { email: 'not-an-e-mail' },
      { email: 'ada@example.com', extra: 1 },
    ]) {
      await http().post('/api/v1/auth/password-reset').send(body).expect(400);
    }
    for (const body of [
      { token: 'short', password: 'brand-new-password' },
      { token: 'a'.repeat(43), password: 'short' },
      { token: 'a'.repeat(43) },
    ]) {
      await http()
        .post('/api/v1/auth/password-reset/confirm')
        .send(body)
        .expect(400);
    }
    expect(sent).toEqual([]);
  });

  it('limits recovery requests per client', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http()
        .post('/api/v1/auth/password-reset')
        .send({ email: 'nobody@example.com' })
        .expect(204);
    }

    await http()
      .post('/api/v1/auth/password-reset')
      .send({ email: 'nobody@example.com' })
      .expect(429);
  });
});
