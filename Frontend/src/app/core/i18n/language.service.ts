import { HttpClient } from '@angular/common/http';
import { DOCUMENT, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { LOCALES, type Locale, type UpdateProfileRequest } from '@plano/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.models';
import { API_BASE_URL } from '../http/api-base-url';

export const DEFAULT_LOCALE: Locale = 'fr';
/** This browser's last choice, so the login page already speaks it. */
const STORAGE_KEY = 'plano:locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The interface language. Before sign-in: this browser's last choice, else the
 * browser's preferred languages, else French. Once signed in, the account's
 * language wins, and choosing one in Settings saves it on the account.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly apiUrl = `${inject(API_BASE_URL)}/users/me`;
  private readonly activeState = signal<Locale>(DEFAULT_LOCALE);

  readonly active = this.activeState.asReadonly();

  constructor() {
    // Reacts to sign-ins and account updates only: reading the active language
    // untracked keeps a fresh Settings choice from being reverted before it is saved.
    effect(() => {
      const locale = this.auth.user()?.locale;
      untracked(() => {
        if (locale && locale !== this.activeState()) void this.use(locale);
      });
    });
  }

  /** Runs before the first render, so no text shows up in the wrong language. */
  initialize(): Promise<void> {
    return this.use(this.initialLocale());
  }

  /** Switches the interface; the translation file loads first, then everything re-renders. */
  async use(locale: Locale): Promise<void> {
    await firstValueFrom(this.transloco.load(locale));
    this.transloco.setActiveLang(locale);
    this.activeState.set(locale);
    this.document.documentElement.lang = locale;
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Storage can be unavailable (private mode): the choice still applies to this page.
    }
  }

  /** The Settings choice: applied at once, then saved on the account; false if saving failed. */
  async choose(locale: Locale): Promise<boolean> {
    await this.use(locale);
    if (!this.auth.user()) return true;
    try {
      const details: UpdateProfileRequest = { locale };
      this.auth.updateUser(await firstValueFrom(this.http.patch<AuthUser>(this.apiUrl, details)));
      return true;
    } catch {
      return false;
    }
  }

  private initialLocale(): Locale {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (isLocale(stored)) return stored;
    const preferred = (this.document.defaultView?.navigator.languages ?? [])
      .map((language) => language.slice(0, 2).toLowerCase())
      .find(isLocale);
    return preferred ?? DEFAULT_LOCALE;
  }
}
