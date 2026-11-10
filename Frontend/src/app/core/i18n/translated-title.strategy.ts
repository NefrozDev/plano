import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { interfaceLocale, t } from './translate';

/**
 * Route titles are translation keys (`titles.lists`): the tab shows
 * "Listes | Plano", and the title follows a language change on the same page.
 */
@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private key: string | undefined;

  constructor() {
    super();
    effect(() => {
      interfaceLocale();
      this.apply();
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.apply();
  }

  private apply(): void {
    if (this.key === undefined) return;
    this.title.setTitle(this.key === 'titles.home' ? 'Plano' : `${t(this.key)} | Plano`);
  }
}
