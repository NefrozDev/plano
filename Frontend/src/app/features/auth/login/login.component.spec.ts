import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { BROWSER_LOCATION } from '../../../core/browser/browser-location';
import { providePlanoTesting } from '../../../testing/plano-testing';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  const assign = vi.fn<(url: string) => void>();

  function render(query: Record<string, string> = {}): HTMLElement {
    assign.mockReset();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        providePlanoTesting(),
        { provide: BROWSER_LOCATION, useValue: { assign } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function button(host: HTMLElement): HTMLButtonElement {
    return host.querySelector<HTMLButtonElement>('button.primary-button')!;
  }

  it('explains the Synapse account and has one way in, with no password field', () => {
    const host = render();

    expect(host.querySelector('h2')?.textContent).toContain('Connexion');
    expect(host.textContent).toContain('votre compte Synapse');
    expect(button(host).textContent).toContain('Se connecter ou créer un compte');
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('sends the browser to the sign-in with where it was going and the language', () => {
    const host = render({ returnUrl: '/lists/42' });
    const signInUrl = vi.spyOn(TestBed.inject(AuthService), 'signInUrl');

    button(host).click();

    expect(signInUrl).toHaveBeenCalledExactlyOnceWith('/lists/42', 'fr');
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/auth/login?returnTo=%2Flists%2F42&lang=fr',
    );
  });

  it('never sends the browser back to another site', () => {
    const host = render({ returnUrl: '//evil.example' });

    button(host).click();

    expect(assign).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/login?returnTo=%2F&lang=fr');
  });

  it('says when the last sign-in was cancelled', () => {
    const host = render({ signIn: 'cancelled' });

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'La connexion a été annulée.',
    );
  });

  it('says when the last sign-in failed', () => {
    const host = render({ signIn: 'failed' });

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('La connexion a échoué.');
  });
});
