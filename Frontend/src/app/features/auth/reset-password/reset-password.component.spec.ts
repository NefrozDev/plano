import type { MockInstance } from 'vitest';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { providePlanoTesting } from '../../../testing/plano-testing';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
  const TOKEN = 'A'.repeat(40) + '_-9';
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let navigate: MockInstance<Router['navigate']>;

  function create(fragment: string | null): void {
    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [...providePlanoTesting(), { provide: ActivatedRoute, useValue: { snapshot: { fragment } } }],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ResetPasswordComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  function fill(password: string, confirmation = password): void {
    for (const [id, value] of [['#reset-password', password], ['#reset-confirmation', confirmation]]) {
      const input = element.querySelector(id) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
  }
  const submit = () => {
    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  afterEach(() => http.verify());

  it('reads the token from the fragment, hides it, and sets the new password', () => {
    create(`token=${TOKEN}`);
    expect(navigate).toHaveBeenCalledExactlyOnceWith([], { fragment: undefined, replaceUrl: true });

    fill('brand-new-password');
    submit();
    const request = http.expectOne('/api/v1/auth/password-reset/confirm');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: TOKEN, password: 'brand-new-password' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(element.querySelector('[role="status"]')?.textContent).toContain('Votre mot de passe est changé');
    expect(element.querySelector('a.primary-button')?.getAttribute('href')).toBe('/login');
    expect(element.querySelectorAll('a[href="/login"]')).toHaveLength(1);
    expect(element.querySelector('form')).toBeNull();
  });

  it('checks the password and its confirmation before calling the API', () => {
    create(`token=${TOKEN}`);

    submit();
    expect(element.querySelector('#reset-password-error')?.textContent).toContain('Choisissez un mot de passe');
    expect(element.querySelector('#reset-confirmation-error')?.textContent).toContain('Saisissez à nouveau');
    fill('short');
    fixture.detectChanges();
    expect(element.querySelector('#reset-password-error')?.textContent).toContain('au moins 8 caractères');
    fill('p'.repeat(129));
    fixture.detectChanges();
    expect(element.querySelector('#reset-password-error')?.textContent).toContain('128 caractères');
    fill('brand-new-password', 'brand-new-passw0rd');
    fixture.detectChanges();
    expect(element.querySelector('#reset-confirmation-error')?.textContent).toContain('ne correspondent pas');
    // Changing the first field re-checks the second.
    fill('brand-new-passw0rd', 'brand-new-passw0rd');
    fixture.detectChanges();
    expect(element.querySelector('#reset-confirmation-error')).toBeNull();

    http.expectNone('/api/v1/auth/password-reset/confirm');
  });

  it('offers a new link when the token is refused, and explains other failures', () => {
    create(`token=${TOKEN}`);
    fill('brand-new-password');

    submit();
    http
      .expectOne('/api/v1/auth/password-reset/confirm')
      .flush({ message: 'Ce lien n’est plus valable. Demandez-en un nouveau.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    const alert = element.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.textContent).toContain('Ce lien n’est plus valable');
    expect(alert.querySelector('a')?.getAttribute('href')).toBe('/forgot-password');

    submit();
    http.expectOne('/api/v1/auth/password-reset/confirm').flush(null, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Trop de tentatives');
    expect(element.querySelector('[role="alert"] a')).toBeNull();
  });

  it('says a link without a valid token is incomplete, and asks nothing', () => {
    create('token=too-short');

    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Ce lien est incomplet');
    expect(element.querySelector('a.primary-button')?.getAttribute('href')).toBe('/forgot-password');
    // The malformed token is still taken out of the address bar.
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('touches nothing in the address bar without a fragment', () => {
    create(null);

    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Ce lien est incomplet');
  });
});
