import type { MockInstance } from 'vitest';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ProfileService } from '../../core/users/profile.service';
import { AVATAR_RESIZER, MAX_SOURCE_BYTES, UnreadableImageError } from '../../core/users/resize-avatar';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let element: HTMLElement;
  let auth: AuthService;
  let http: HttpTestingController;
  let setItem: MockInstance<Storage['setItem']>;
  let resize: ReturnType<typeof vi.fn<(file: Blob) => Promise<Blob>>>;
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  /** A file input holding `file`, as after the user picked it. */
  function fileInput(file: File): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return input;
  }

  async function render(): Promise<void> {
    await settle();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    // The language choice must not reach this browser's real storage.
    setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    resize = vi.fn<(file: Blob) => Promise<Blob>>().mockName('resizeAvatar');
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [...providePlanoTesting(), { provide: AVATAR_RESIZER, useValue: resize }],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    auth.login({ username: 'ada', password: 'secret' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(user);
    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    await render();
  });

  afterEach(() => {
    http.verify();
    setItem.mockRestore();
  });

  it('shows the profile, every language under its own name, and the groups link', () => {
    expect(element.querySelector('h1')?.textContent).toBe('Paramètres');
    expect(element.querySelector('.identity')?.textContent).toContain('Ada Lovelace');
    expect(element.querySelector('.identity')?.textContent).toContain('@ada');
    expect(element.querySelector('app-user-avatar')?.textContent?.trim()).toBe('AL');
    expect(element.querySelector('.photo-actions label')?.textContent).toContain('Ajouter une photo');
    expect(element.querySelector('.photo-actions button')).toBeNull();

    const languages = Array.from(element.querySelectorAll<HTMLLabelElement>('.language'));
    expect(languages.map((label) => [label.lang, label.textContent?.trim()])).toEqual([
      ['fr', 'Français'],
      ['en', 'English'],
      ['nl', 'Nederlands'],
      ['es', 'Español'],
      ['de', 'Deutsch'],
      ['it', 'Italiano'],
    ]);
    expect(languages[0].querySelector('input')?.checked).toBe(true);
    expect(element.querySelector('.row-link')?.getAttribute('href')).toBe('/groups');
  });

  it('saves a language picked from the list', async () => {
    const choose = vi.spyOn(TestBed.inject(LanguageService), 'choose');

    (element.querySelectorAll<HTMLInputElement>('.language input')[4]).click();
    await settle();
    const request = http.expectOne('/api/v1/users/me');
    expect(request.request.body).toEqual({ locale: 'de' });
    request.flush({ ...user, locale: 'de' });
    await render();

    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledWith('de');
    expect(element.querySelector('.field-error')).toBeNull();
    expect(element.querySelectorAll<HTMLInputElement>('.language input')[4].checked).toBe(true);
  });

  it('warns when the language could not be saved on the account', async () => {
    vi.spyOn(TestBed.inject(LanguageService), 'choose').mockResolvedValue(false);

    await component.chooseLanguage('it');
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('n’a pas pu être enregistrée sur votre compte');
  });

  describe('photo', () => {
    let upload: MockInstance<ProfileService['uploadAvatar']>;

    beforeEach(() => {
      upload = vi.spyOn(TestBed.inject(ProfileService), 'uploadAvatar');
    });

    it('resizes the picked picture before uploading it', async () => {
      const resized = new Blob(['webp'], { type: 'image/webp' });
      resize.mockResolvedValue(resized);
      upload.mockImplementation(() => {
        auth.updateUser({ ...user, avatarVersion: 7 });
        return of({ ...user, avatarVersion: 7 });
      });
      const picked = new File(['photo'], 'me.jpg', { type: 'image/jpeg' });
      const input = fileInput(picked);

      await component.changePhoto(input);
      fixture.detectChanges();

      expect(resize).toHaveBeenCalledTimes(1);
      expect(resize).toHaveBeenCalledWith(picked);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload).toHaveBeenCalledWith(resized);
      // The same file can be picked again right away.
      expect(input.value).toBe('');
      expect(component.photoBusy()).toBe(false);
      expect(element.querySelector('app-user-avatar img')?.getAttribute('src')).toBe('/api/v1/users/user-1/avatar?v=7');
      expect(element.querySelector('.photo-actions label')?.textContent).toContain('Changer la photo');
      expect(element.querySelector('.photo-actions button')?.textContent).toContain('Retirer la photo');
    });

    it('refuses huge or unreadable files without uploading anything', async () => {
      const huge = new File(['x'], 'huge.jpg');
      Object.defineProperty(huge, 'size', { value: MAX_SOURCE_BYTES + 1 });

      await component.changePhoto(fileInput(huge));
      fixture.detectChanges();
      expect(resize).not.toHaveBeenCalled();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('trop lourde');

      resize.mockRejectedValue(new UnreadableImageError('nope'));
      await component.changePhoto(fileInput(new File(['text'], 'notes.txt')));
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('ne peut pas être lue');
      expect(upload).not.toHaveBeenCalled();
    });

    it('reports a failed upload and ignores an empty pick', async () => {
      resize.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
      upload.mockReturnValue(throwError(() => new Error('offline')));

      await component.changePhoto(document.createElement('input'));
      expect(upload).not.toHaveBeenCalled();

      await component.changePhoto(fileInput(new File(['photo'], 'me.png')));
      fixture.detectChanges();
      expect(upload).toHaveBeenCalledTimes(1);
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('n’a pas pu être enregistrée');
      expect(component.photoBusy()).toBe(false);
    });

    it('removes the picture', async () => {
      auth.updateUser({ ...user, avatarVersion: 7 });
      fixture.detectChanges();

      (element.querySelector('.photo-actions button') as HTMLButtonElement).click();
      await settle();
      http.expectOne({ method: 'DELETE', url: '/api/v1/users/me/avatar' }).flush(user);
      await render();

      expect(auth.user()?.avatarVersion).toBeNull();
      expect(element.querySelector('app-user-avatar img')).toBeNull();
      expect(element.querySelector('.photo-actions button')).toBeNull();
    });
  });

  describe('sign-out', () => {
    it('signs out and returns to the login page', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      (element.querySelector('.logout') as HTMLButtonElement).click();
      http.expectOne('/api/v1/auth/logout').flush(null);

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('/login');
      expect(component.logoutPending()).toBe(false);
    });

    it('ignores a second click while signing out, and stays when it fails', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      const logout = vi.spyOn(auth, 'logout');

      component.logout();
      component.logout();
      expect(logout).toHaveBeenCalledTimes(1);
      http
        .expectOne('/api/v1/auth/logout')
        .flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      // Still signed in on the server: stay on the page.
      expect(navigate).not.toHaveBeenCalled();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('La déconnexion a échoué');
      expect(component.logoutPending()).toBe(false);
    });
  });
});
