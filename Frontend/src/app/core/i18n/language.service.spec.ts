import type { MockInstance } from 'vitest';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { LanguageService, isLocale } from './language.service';

describe('LanguageService', () => {
  let language: LanguageService;
  let auth: AuthService;
  let http: HttpTestingController;
  let stored: string | null;
  let getItem: MockInstance<Storage['getItem']>;
  let setItem: MockInstance<Storage['setItem']>;
  let languages: MockInstance<() => readonly string[]>;
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  /** Signs Ada in the way a login response would, and lets the language follow. */
  async function signIn(locale: AuthUser['locale']): Promise<void> {
    auth.login({ username: 'ada', password: 'secret' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush({ ...user, locale });
    TestBed.tick();
    await settle();
  }

  beforeEach(() => {
    // Specs share one browser: storage is faked, never really written.
    stored = null;
    getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => stored);
    setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((_key, value) => {
      stored = value;
    });
    languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US', 'fr']);
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    language = TestBed.inject(LanguageService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    getItem.mockRestore();
    setItem.mockRestore();
    languages.mockRestore();
    document.documentElement.lang = 'fr';
  });

  it('starts in the first supported browser language, and remembers the choice', async () => {
    languages.mockReturnValue(['pt-BR', 'de-CH', 'en']);

    await language.initialize();

    expect(language.active()).toBe('de');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(setItem).toHaveBeenCalledWith('plano:locale', 'de');
  });

  it('prefers this browser’s last choice, and falls back to French', async () => {
    stored = 'it';
    await language.initialize();
    expect(language.active()).toBe('it');

    stored = 'klingon';
    languages.mockReturnValue(['pt-BR', 'ja']);
    await language.initialize();
    expect(language.active()).toBe('fr');
  });

  it('switches to the account language once signed in', async () => {
    await language.initialize();
    expect(language.active()).toBe('en');

    await signIn('es');

    expect(language.active()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('saves a choice on the account and keeps the fresh user', async () => {
    await signIn('fr');
    const updateUser = vi.spyOn(auth, 'updateUser');

    const choosing = language.choose('nl');
    await settle();
    const request = http.expectOne('/api/v1/users/me');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ locale: 'nl' });
    request.flush({ ...user, locale: 'nl' });
    TestBed.tick();

    await expect(choosing).resolves.toBe(true);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ ...user, locale: 'nl' });
    expect(auth.user()?.locale).toBe('nl');
    expect(language.active()).toBe('nl');
  });

  it('applies a choice without saving it while signed out', async () => {
    await expect(language.choose('de')).resolves.toBe(true);

    expect(language.active()).toBe('de');
    http.expectNone('/api/v1/users/me');
  });

  it('keeps the new language on screen when saving it fails', async () => {
    await signIn('fr');

    const choosing = language.choose('it');
    await settle();
    http
      .expectOne('/api/v1/users/me')
      .flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' });
    TestBed.tick();

    await expect(choosing).resolves.toBe(false);
    expect(language.active()).toBe('it');
    expect(auth.user()?.locale).toBe('fr');
  });

  it('recognizes only the supported locales', () => {
    expect(['fr', 'en', 'nl', 'es', 'de', 'it'].every(isLocale)).toBe(true);
    expect([null, 'pt', 'FR', 3].some(isLocale)).toBe(false);
  });
});
