import type { MockedObject } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let auth: MockedObject<Pick<AuthService, 'register'>>;
  let component: RegisterComponent;
  let router: Router;

  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  beforeEach(async () => {
    auth = {
      register: vi.fn().mockName('AuthService.register'),
    };
    // LanguageService follows the signed-in user's language.
    Object.assign(auth, { user: signal<AuthUser | null>(null) });
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    component = TestBed.createComponent(RegisterComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  function fillValidForm(): void {
    component.form.setValue({
      lastName: 'Lovelace',
      firstName: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'password123',
      acceptedTerms: true,
    });
  }

  describe('terms', () => {
    let fixture: ComponentFixture<RegisterComponent>;
    let element: HTMLElement;

    beforeEach(() => {
      fixture = TestBed.createComponent(RegisterComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
    });

    const checkbox = (): HTMLInputElement => element.querySelector('#register-terms') as HTMLInputElement;
    const links = (): HTMLButtonElement[] => Array.from(element.querySelectorAll<HTMLButtonElement>('.terms-link'));
    const dialog = (): HTMLDialogElement => element.querySelector('dialog') as HTMLDialogElement;
    const dialogButton = (label: string): HTMLButtonElement =>
      Array.from(dialog().querySelectorAll<HTMLButtonElement>('.dialog-actions button')).find(
        (button) => button.textContent?.trim() === label,
      )!;
    const settle = async (): Promise<void> => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('links both texts from the box, which keeps its check mark icon', () => {
      expect(links().map((link) => link.textContent?.trim())).toEqual([
        'conditions d’utilisation',
        'politique de confidentialité',
      ]);
      expect(element.querySelector('.terms-check svg')).not.toBeNull();
      expect(dialog().open).toBe(false);
    });

    it('opens the terms over the form without ticking the box or losing what was typed', async () => {
      component.form.controls.firstName.setValue('Ada');
      links()[0].click();
      await settle();

      expect(dialog().open).toBe(true);
      expect(dialog().textContent).toContain('1. Objet');
      expect(dialog().textContent).toContain('Règles de conduite');
      expect(checkbox().checked).toBe(false);
      expect(component.form.controls.acceptedTerms.value).toBe(false);
      expect(component.form.controls.firstName.value).toBe('Ada');
      expect(auth.register).not.toHaveBeenCalled();
    });

    it('ticks the box when accepted from the dialog, and closes it', async () => {
      links()[0].click();
      await settle();
      dialogButton('J’accepte').click();
      await settle();

      expect(dialog().open).toBe(false);
      expect(checkbox().checked).toBe(true);
      expect(component.form.controls.acceptedTerms.value).toBe(true);
      expect(component.showError('acceptedTerms')).toBe(false);
    });

    it('closes without accepting', async () => {
      links()[0].click();
      await settle();
      dialogButton('Fermer').click();
      await settle();

      expect(dialog().open).toBe(false);
      expect(component.termsOpen()).toBe(false);
      expect(component.form.controls.acceptedTerms.value).toBe(false);
    });

    it('opens the privacy policy at its own section', async () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      links()[1].click();
      await settle();

      expect(dialog().open).toBe(true);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(element.querySelector('#terms-privacy'));
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
      scrollIntoView.mockRestore();
    });

    it('still ticks the box from the rest of its sentence, and refuses to submit without it', () => {
      (element.querySelector('label[for="register-terms"]') as HTMLLabelElement).click();
      fixture.detectChanges();
      expect(component.form.controls.acceptedTerms.value).toBe(true);

      checkbox().click();
      fixture.detectChanges();
      fillValidForm();
      component.form.controls.acceptedTerms.setValue(false);
      component.submit();
      fixture.detectChanges();

      expect(auth.register).not.toHaveBeenCalled();
      expect(element.querySelector('#register-terms-error')?.textContent).toContain('accepter les conditions');
      expect(checkbox().getAttribute('aria-invalid')).toBe('true');
    });
  });

  it('rejects mismatched password confirmation locally', () => {
    component.form.setValue({
      lastName: 'Lovelace',
      firstName: 'Ada',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      passwordConfirmation: 'different123',
      acceptedTerms: true,
    });

    component.submit();

    expect(component.form.hasError('passwordMismatch')).toBe(true);
    expect(component.passwordConfirmationError()).toContain('correspondent pas');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('reports confirmation errors only after interaction or submission', () => {
    expect(component.passwordConfirmationError()).toBe('');

    component.form.controls.passwordConfirmation.markAsTouched();
    expect(component.passwordConfirmationError()).toContain('Confirmez');

    fillValidForm();
    component.form.controls.passwordConfirmation.markAsTouched();
    expect(component.passwordConfirmationError()).toBe('');
  });

  it('shows invalid fields after they are touched or submitted', () => {
    expect(component.showError('email')).toBe(false);
    component.form.controls.email.markAsTouched();
    expect(component.showError('email')).toBe(true);
    component.submitted.set(true);
    expect(component.showError('acceptedTerms')).toBe(true);
  });

  it('enforces the username format used by the backend', () => {
    component.form.controls.username.setValue('not allowed!');

    expect(component.form.controls.username.hasError('pattern')).toBe(true);
  });

  it('submits only the backend contract and then opens group setup', () => {
    auth.register.mockReturnValue(of(user));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({
      lastName: '  Lovelace ',
      firstName: ' Ada  ',
      username: ' ada ',
      email: ' ADA@EXAMPLE.COM ',
      password: 'password123',
      passwordConfirmation: 'password123',
      acceptedTerms: true,
    });

    component.submit();

    expect(auth.register).toHaveBeenCalledTimes(1);

    expect(auth.register).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      username: 'ada',
      email: 'ada@example.com',
      password: 'password123',
      acceptedTerms: true,
      // The account starts in the language the page was shown in.
      locale: 'fr',
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/groups');
  });

  it('registers in the language currently shown', async () => {
    // Keeps the choice out of this browser's storage, which other specs share.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
    try {
      await TestBed.inject(LanguageService).use('de');
      auth.register.mockReturnValue(of(user));
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      fillValidForm();

      component.submit();

      expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de' }));
    } finally {
      setItem.mockRestore();
    }
  });

  it('does not submit twice while registration is pending', () => {
    fillValidForm();
    component.submitting.set(true);

    component.submit();

    expect(auth.register).not.toHaveBeenCalled();
  });

  it('shows the API conflict without guessing which field is taken', () => {
    // The API names neither field on purpose, so accounts cannot be enumerated.
    const navigate = vi.spyOn(router, 'navigateByUrl');
    fillValidForm();
    auth.register.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              message:
                "Ce nom d'utilisateur ou cette adresse e-mail est déjà utilisé.",
            },
          }),
      ),
    );

    component.submit();

    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(component.submissionError()).toContain('Un compte utilise déjà');
    expect(component.submitting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps offline, malformed, validation, and server failures', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl');
    fillValidForm();
    auth.register
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(throwError(() => new Error('unexpected')))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 400 })))
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));

    component.submit();
    expect(component.submissionError()).toContain('Impossible de joindre');
    component.submit();
    expect(component.submissionError()).toContain('inattendue');
    component.submit();
    expect(component.submissionError()).toContain('informations sont invalides');
    component.submit();
    expect(component.submissionError()).toContain('création du compte a échoué');
    expect(auth.register).toHaveBeenCalledTimes(4);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('asks the user to wait when the API rate limits registrations', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl');
    fillValidForm();
    auth.register.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));

    component.submit();

    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(component.submissionError()).toContain('Trop de tentatives');
    expect(component.submitting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
