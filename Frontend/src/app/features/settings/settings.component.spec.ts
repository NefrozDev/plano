import type { MockInstance } from 'vitest';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ProfileService } from '../../core/users/profile.service';
import { AVATAR_RESIZER, type AvatarResizer, MAX_SOURCE_BYTES, UnreadableImageError } from '../../core/users/resize-avatar';
import { providePlanoTesting, settle } from '../../testing/plano-testing';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let element: HTMLElement;
  let auth: AuthService;
  let http: HttpTestingController;
  let setItem: MockInstance<Storage['setItem']>;
  let resize: ReturnType<typeof vi.fn<AvatarResizer>>;
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  /** A real 400×200 PNG, so the cropper can decode it. */
  async function photo(name = 'me.png'): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 200;
    (canvas.getContext('2d') as CanvasRenderingContext2D).fillRect(0, 0, 400, 200);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((png) => resolve(png as Blob), 'image/png'));
    return new File([blob], name, { type: 'image/png' });
  }

  const dialog = () => element.querySelector('dialog') as HTMLDialogElement;
  const saveButton = () => element.querySelector<HTMLButtonElement>('app-avatar-cropper .primary-button');

  /** Picks `file` and waits until the cropper has decoded it (or given up on it). */
  async function pick(file: File): Promise<void> {
    component.changePhoto(fileInput(file));
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      if (component.cropping() && saveButton()?.disabled !== false) throw new Error('still decoding');
    });
  }

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
    resize = vi.fn<AvatarResizer>().mockName('resizeAvatar');
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
    fixture.detectChanges();
    // The friends panel loads its lists (covered by its own spec).
    http.expectOne('/api/v1/friends').flush([]);
    http.expectOne('/api/v1/friends/requests').flush({ incoming: [], outgoing: [] });
    await render();
  });

  afterEach(() => {
    http.verify();
    setItem.mockRestore();
    vi.restoreAllMocks();
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

    it('crops the picked picture to the chosen area, then resizes and uploads it', async () => {
      const createUrl = vi.spyOn(URL, 'createObjectURL');
      const revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
      const resized = new Blob(['webp'], { type: 'image/webp' });
      resize.mockResolvedValue(resized);
      upload.mockImplementation(() => {
        auth.updateUser({ ...user, avatarVersion: 7 });
        return of({ ...user, avatarVersion: 7 });
      });
      const picked = await photo();
      const input = fileInput(picked);

      component.changePhoto(input);
      fixture.detectChanges();
      // The same file can be picked again right away.
      expect(input.value).toBe('');
      expect(createUrl).toHaveBeenCalledExactlyOnceWith(picked);
      const url = createUrl.mock.results[0].value as string;
      expect(dialog().open).toBe(true);
      expect(dialog().querySelector('h2')?.textContent).toBe('Recadrer la photo');
      expect(dialog().querySelector('img')?.getAttribute('src')).toBe(url);
      // Nothing is uploaded before the area is confirmed.
      expect(resize).not.toHaveBeenCalled();

      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(saveButton()?.disabled).toBe(false);
      });
      saveButton()!.click();
      await settle();
      fixture.detectChanges();

      // Zoom 1 on a 400×200 picture: its centred 200 px square.
      expect(resize).toHaveBeenCalledExactlyOnceWith(picked, { x: 100, y: 0, size: 200 });
      expect(upload).toHaveBeenCalledExactlyOnceWith(resized);
      expect(revokeUrl).toHaveBeenCalledExactlyOnceWith(url);
      expect(dialog().open).toBe(false);
      expect(component.photoBusy()).toBe(false);
      expect(element.querySelector('app-user-avatar img')?.getAttribute('src')).toBe('/api/v1/users/user-1/avatar?v=7');
      expect(element.querySelector('.photo-actions label')?.textContent).toContain('Changer la photo');
      expect(element.querySelector('.photo-actions button')?.textContent).toContain('Retirer la photo');
    });

    it('closes the cropper without uploading when cancelled', async () => {
      const revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
      await pick(await photo());

      (element.querySelector('app-avatar-cropper button.secondary') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.cropping()).toBeNull();
      expect(dialog().open).toBe(false);
      expect(revokeUrl).toHaveBeenCalledTimes(1);
      expect(resize).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    });

    it('refuses huge or unreadable files without uploading anything', async () => {
      const huge = new File(['x'], 'huge.jpg');
      Object.defineProperty(huge, 'size', { value: MAX_SOURCE_BYTES + 1 });

      component.changePhoto(fileInput(huge));
      fixture.detectChanges();
      expect(component.cropping()).toBeNull();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('trop lourde');

      // The browser cannot decode it: the cropper gives up and the page says why.
      await pick(new File(['text'], 'notes.txt', { type: 'text/plain' }));
      expect(component.cropping()).toBeNull();
      expect(dialog().open).toBe(false);
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('ne peut pas être lue');

      // Decodable by the browser but not by the resizer.
      resize.mockRejectedValue(new UnreadableImageError('nope'));
      await pick(await photo());
      saveButton()!.click();
      await settle();
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('ne peut pas être lue');
      expect(upload).not.toHaveBeenCalled();
    });

    it('reports a failed upload and ignores an empty pick', async () => {
      resize.mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
      upload.mockReturnValue(throwError(() => new Error('offline')));

      component.changePhoto(document.createElement('input'));
      expect(component.cropping()).toBeNull();

      await pick(await photo());
      saveButton()!.click();
      await settle();
      fixture.detectChanges();
      expect(upload).toHaveBeenCalledTimes(1);
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('n’a pas pu être enregistrée');
      expect(component.photoBusy()).toBe(false);
    });

    it('frees the picked picture when the page closes mid-crop', async () => {
      const revokeUrl = vi.spyOn(URL, 'revokeObjectURL');
      await pick(await photo());

      fixture.destroy();

      expect(revokeUrl).toHaveBeenCalledTimes(1);
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
