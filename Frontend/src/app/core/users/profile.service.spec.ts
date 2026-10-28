import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { providePlanoTesting } from '../../testing/plano-testing';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let profile: ProfileService;
  let auth: AuthService;
  let http: HttpTestingController;
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    profile = TestBed.inject(ProfileService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    auth.login({ username: 'ada', password: 'secret' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(user);
  });

  afterEach(() => http.verify());

  it('uploads the picture as multipart and keeps the returned user', async () => {
    const picture = new Blob(['webp'], { type: 'image/webp' });
    profile.uploadAvatar(picture).subscribe();

    const request = http.expectOne('/api/v1/users/me/avatar');
    expect(request.request.method).toBe('PUT');
    const body = request.request.body as FormData;
    const sent = body.get('avatar') as File;
    expect(sent.name).toBe('avatar.webp');
    expect(await sent.text()).toBe('webp');
    request.flush({ ...user, avatarVersion: 5 });

    expect(auth.user()?.avatarVersion).toBe(5);
  });

  it('names a PNG fallback after its type', () => {
    profile.uploadAvatar(new Blob(['png'], { type: 'image/png' })).subscribe();

    const request = http.expectOne('/api/v1/users/me/avatar');
    expect(((request.request.body as FormData).get('avatar') as File).name).toBe('avatar.png');
    request.flush(user);
  });

  it('removes the picture and keeps the returned user', () => {
    auth.updateUser({ ...user, avatarVersion: 5 });
    profile.removeAvatar().subscribe();

    const request = http.expectOne('/api/v1/users/me/avatar');
    expect(request.request.method).toBe('DELETE');
    request.flush(user);

    expect(auth.user()?.avatarVersion).toBeNull();
  });
});
