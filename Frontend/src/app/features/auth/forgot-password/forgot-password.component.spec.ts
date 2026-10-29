import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { providePlanoTesting } from '../../../testing/plano-testing';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;

  const input = () => element.querySelector('#forgot-email') as HTMLInputElement;
  const submit = () => (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ForgotPasswordComponent], providers: providePlanoTesting() });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ForgotPasswordComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('sends the trimmed address, then says a link is on its way without confirming the account', () => {
    type('  ada@example.com ');
    submit();
    fixture.detectChanges();
    expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Envoi');

    const request = http.expectOne('/api/v1/auth/password-reset');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'ada@example.com' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    const status = element.querySelector('[role="status"]') as HTMLElement;
    expect(status.textContent).toContain('Si un compte utilise ada@example.com');
    expect(element.querySelector('form')).toBeNull();

    // Another address: back to the form, empty of errors.
    (element.querySelector('.link-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(input()).not.toBeNull();
  });

  it('asks for a valid address before calling the API', () => {
    submit();
    fixture.detectChanges();
    expect(element.querySelector('#forgot-email-error')?.textContent).toContain('Saisissez votre adresse e-mail.');
    expect(input().getAttribute('aria-invalid')).toBe('true');

    type('not-an-address');
    fixture.detectChanges();
    expect(element.querySelector('#forgot-email-error')?.textContent).toContain('adresse e-mail valide');

    http.expectNone('/api/v1/auth/password-reset');
  });

  it('explains a refusal and allows another try', () => {
    type('ada@example.com');
    submit();
    http.expectOne('/api/v1/auth/password-reset').flush(null, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Trop de tentatives');

    submit();
    http.expectOne('/api/v1/auth/password-reset').flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('n’a pas pu être envoyé');
    expect(element.querySelector('form')).not.toBeNull();
  });

  it('ignores a second submit while sending', () => {
    type('ada@example.com');
    submit();
    submit();

    expect(http.match('/api/v1/auth/password-reset')).toHaveLength(1);
  });
});
