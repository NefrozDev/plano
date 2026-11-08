import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import type { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { providePlanoTesting } from '../../../testing/plano-testing';
import { WelcomeComponent } from './welcome.component';

describe('WelcomeComponent', () => {
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
    termsAccepted: false,
  };
  let http: HttpTestingController;
  let host: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<WelcomeComponent>>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WelcomeComponent],
      providers: [
        providePlanoTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: '/agenda' }) } },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).restoreSession().subscribe();
    http.expectOne('/api/v1/auth/session').flush(user);
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(WelcomeComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  function accept(): void {
    host.querySelector<HTMLButtonElement>('button.primary-button')!.click();
  }

  it("greets the person and links Plano's terms in a new tab", () => {
    expect(host.querySelector('h2')?.textContent).toContain('Bienvenue, Ada');
    const terms = host.querySelector<HTMLAnchorElement>('a')!;
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(terms.target).toBe('_blank');
  });

  it('records the acceptance, then goes where the person was going', () => {
    accept();

    const request = http.expectOne('/api/v1/users/me/terms');
    expect(request.request.method).toBe('POST');
    request.flush({ ...user, termsAccepted: true });

    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/agenda');
    expect(TestBed.inject(AuthService).user()?.termsAccepted).toBe(true);
  });

  it('says so when it fails, and stays', () => {
    accept();
    http.expectOne('/api/v1/users/me/terms').flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('L’enregistrement a échoué.');
    expect(host.querySelector<HTMLButtonElement>('button.primary-button')!.disabled).toBe(false);
  });
});
