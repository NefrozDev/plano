import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { setInterfaceLocale } from './translate';
import { TranslatedTitleStrategy } from './translated-title.strategy';

@Component({ template: '' })
class PageComponent {}

describe('TranslatedTitleStrategy', () => {
  let title: Title;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: PageComponent, title: 'titles.home' },
          { path: 'lists', component: PageComponent, title: 'titles.lists' },
          { path: 'untitled', component: PageComponent },
        ]),
        { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
      ],
    });
    title = TestBed.inject(Title);
    router = TestBed.inject(Router);
  });

  it('shows the translated page name before the app name, and the app name alone at home', async () => {
    await router.navigateByUrl('/lists');
    expect(title.getTitle()).toBe('Listes | Plano');

    await router.navigateByUrl('/');
    expect(title.getTitle()).toBe('Plano');
  });

  it('follows a language change on the same page', async () => {
    const transloco = TestBed.inject(TranslocoService);
    transloco.setTranslation({ titles: { lists: 'Lists' } }, 'en', { merge: true });
    await router.navigateByUrl('/lists');

    transloco.setActiveLang('en');
    setInterfaceLocale('en');
    TestBed.tick();

    expect(title.getTitle()).toBe('Lists | Plano');
  });

  it('leaves the title alone on a route without one', async () => {
    await router.navigateByUrl('/lists');
    const setTitle = vi.spyOn(title, 'setTitle');

    await router.navigateByUrl('/untitled');

    expect(setTitle).not.toHaveBeenCalled();
    expect(title.getTitle()).toBe('Listes | Plano');
  });
});
