import request from 'supertest';
import type { AuthUser } from './../src/auth/auth.types';
import { MAX_AVATAR_BYTES } from './../src/users/avatar-image';
import {
  type RegisteredUser,
  type TestApp,
  createTestApp,
  registerUser,
  validRegistration,
} from './e2e-helpers';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);

describe('Profile: language and picture (e2e)', () => {
  let testApp: TestApp;
  let ada: RegisteredUser;

  const http = () => request(testApp.app.getHttpServer());
  const session = async () =>
    (
      await http()
        .get('/api/v1/auth/session')
        .set('Cookie', ada.cookie)
        .expect(200)
    ).body as AuthUser;

  beforeEach(async () => {
    testApp = await createTestApp();
    ada = await registerUser(testApp.app, 'ada');
  });

  afterEach(() => testApp.close());

  it('registers in the language sent, and changes it later', async () => {
    const english = await http()
      .post('/api/v1/auth/register')
      .send({
        ...validRegistration,
        username: 'eve',
        email: 'eve@example.com',
        locale: 'en',
      })
      .expect(201);
    expect((english.body as AuthUser).locale).toBe('en');
    await http()
      .post('/api/v1/auth/register')
      .send({
        ...validRegistration,
        username: 'zed',
        email: 'zed@example.com',
        locale: 'klingon',
      })
      .expect(400);

    expect((await session()).locale).toBe('fr');
    await http()
      .patch('/api/v1/users/me')
      .set('Cookie', ada.cookie)
      .send({ locale: 'es' })
      .expect(200);
    await http()
      .patch('/api/v1/users/me')
      .set('Cookie', ada.cookie)
      .send({ locale: 'xx' })
      .expect(400);
    await http()
      .patch('/api/v1/users/me')
      .set('Cookie', ada.cookie)
      .send({ email: 'other@example.com' })
      .expect(400);
    expect((await session()).locale).toBe('es');
  });

  it('uploads, serves and removes a profile picture', async () => {
    await http()
      .put('/api/v1/users/me/avatar')
      .attach('avatar', PNG, 'me.png')
      .expect(401);

    const uploaded = (
      await http()
        .put('/api/v1/users/me/avatar')
        .set('Cookie', ada.cookie)
        .attach('avatar', PNG, { filename: 'me.png', contentType: 'image/png' })
        .expect(200)
    ).body as AuthUser;
    expect(uploaded.avatarVersion).toEqual(expect.any(Number));
    expect((await session()).avatarVersion).toBe(uploaded.avatarVersion);

    const picture = await http()
      .get(`/api/v1/users/${ada.user.id}/avatar?v=${uploaded.avatarVersion}`)
      .set('Cookie', ada.cookie)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(picture.headers['content-type']).toBe('image/png');
    expect(picture.headers['cache-control']).toContain('immutable');
    expect(picture.headers['x-content-type-options']).toBe('nosniff');
    expect(picture.body).toEqual(PNG);
    await http().get(`/api/v1/users/${ada.user.id}/avatar`).expect(401);

    await http()
      .delete('/api/v1/users/me/avatar')
      .set('Cookie', ada.cookie)
      .expect(200);
    await http()
      .get(`/api/v1/users/${ada.user.id}/avatar`)
      .set('Cookie', ada.cookie)
      .expect(404);
  });

  it('rejects files that are not images, too large, or missing', async () => {
    const upload = () =>
      http().put('/api/v1/users/me/avatar').set('Cookie', ada.cookie);

    // Claiming to be a PNG is not enough: the content decides.
    await upload()
      .attach('avatar', Buffer.from('<svg onload="alert(1)"/>'), {
        filename: 'evil.png',
        contentType: 'image/png',
      })
      .expect(400);
    await upload()
      .attach(
        'avatar',
        Buffer.concat([PNG, Buffer.alloc(MAX_AVATAR_BYTES)]),
        'big.png',
      )
      .expect(413);
    await upload().expect(400);
    await upload().attach('other', PNG, 'me.png').expect(400);

    expect((await session()).avatarVersion).toBeNull();
  });
});
