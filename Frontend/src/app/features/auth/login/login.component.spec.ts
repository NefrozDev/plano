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

  describe('on arrival', () => {
    it('tries a silent sign-in once, keeping where it was going and the language', () => {
      const host = render({ returnUrl: '/lists/42' });

      expect(assign).toHaveBeenCalledExactlyOnceWith(
        '/api/v1/auth/login?returnTo=%2Flists%2F42&lang=fr&silent=1',
      );
      // The page says it is leaving, and cannot be sent a second time.
      expect(button(host).disabled).toBe(true);
      expect(button(host).getAttribute('aria-busy')).toBe('true');
      expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it('never sends the silent sign-in back to another site', () => {
      render({ returnUrl: '//evil.example' });

      expect(assign).toHaveBeenCalledExactlyOnceWith(
        '/api/v1/auth/login?returnTo=%2F&lang=fr&silent=1',
      );
    });

    it.each(['none', 'cancelled', 'failed'])(
      'waits for the button when the last sign-in came back (%s), so it never loops',
      (signIn) => {
        const host = render({ signIn });

        expect(assign).not.toHaveBeenCalled();
        expect(button(host).disabled).toBe(false);
      },
    );
  });

  describe('after a silent sign-in found no Synapse session', () => {
    it('explains the Synapse account and has one way in, with no password field or alert', () => {
      const host = render({ signIn: 'none' });

      expect(host.querySelector('h2')?.textContent).toContain('Connexion');
      expect(host.textContent).toContain('votre compte Synapse');
      expect(button(host).textContent).toContain('Se connecter ou créer un compte');
      expect(host.querySelector('input')).toBeNull();
      expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it('sends the browser to the sign-in pages with where it was going and the language', () => {
      const host = render({ signIn: 'none', returnUrl: '/lists/42' });
      const signInUrl = vi.spyOn(TestBed.inject(AuthService), 'signInUrl');

      button(host).click();

      expect(signInUrl).toHaveBeenCalledExactlyOnceWith('/lists/42', 'fr', false);
      expect(assign).toHaveBeenCalledExactlyOnceWith(
        '/api/v1/auth/login?returnTo=%2Flists%2F42&lang=fr',
      );
    });

    it('never sends the browser back to another site', () => {
      const host = render({ signIn: 'none', returnUrl: '//evil.example' });

      button(host).click();

      expect(assign).toHaveBeenCalledExactlyOnceWith('/api/v1/auth/login?returnTo=%2F&lang=fr');
    });
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
