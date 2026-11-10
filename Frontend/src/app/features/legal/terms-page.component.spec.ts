import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TermsPageComponent } from './terms-page.component';

@Component({ template: '' })
class BlankComponent {}

describe('TermsPageComponent', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'terms', component: TermsPageComponent },
          { path: 'settings', component: BlankComponent },
          { path: '', component: BlankComponent },
        ]),
      ],
    });
    router = TestBed.inject(Router);
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(TermsPageComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const backButton = (element: HTMLElement): HTMLButtonElement =>
    element.querySelector('.back-bubble') as HTMLButtonElement;

  it('shows the terms, the privacy policy and their date under a heading', () => {
    const element = render();

    expect(element.querySelector('h2')?.textContent).toBe('Conditions d’utilisation');
    expect(element.textContent).toContain('Dernière mise à jour : 8 novembre 2026');
    expect(element.querySelector('#terms-privacy h3')?.textContent).toBe('8. Politique de confidentialité');
    expect(backButton(element).getAttribute('aria-label')).toBe('Retour');
  });

  it('goes back where the user came from', async () => {
    await router.navigateByUrl('/settings');
    await router.navigateByUrl('/terms');
    const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
    const navigate = vi.spyOn(router, 'navigateByUrl');

    backButton(render()).click();

    expect(back).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes home when the page was opened directly', async () => {
    await router.navigateByUrl('/terms');
    const back = vi.spyOn(TestBed.inject(Location), 'back');
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    backButton(render()).click();

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/');
    expect(back).not.toHaveBeenCalled();
  });
});
