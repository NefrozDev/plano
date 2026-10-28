import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LOCALES, type Locale } from '@plano/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';
import { ProfileService } from '../../core/users/profile.service';
import { AVATAR_RESIZER, MAX_SOURCE_BYTES, UnreadableImageError } from '../../core/users/resize-avatar';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { UserAvatarComponent } from '../../shared/ui/user-avatar.component';

/** Each language under its own name, so anyone finds theirs whatever is shown. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
  nl: 'Nederlands',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
};

/** `/settings`, opened from the profile picture: photo, language, groups and sign-out. */
@Component({
  selector: 'app-settings',
  imports: [PageHeaderComponent, RouterLink, TranslocoPipe, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly router = inject(Router);
  private readonly profile = inject(ProfileService);
  private readonly resize = inject(AVATAR_RESIZER);
  readonly auth = inject(AuthService);
  readonly language = inject(LanguageService);

  readonly locales = LOCALES;
  readonly languageNames = LANGUAGE_NAMES;
  /** Translation key of the last photo error, empty when none. */
  readonly photoError = signal('');
  readonly photoBusy = signal(false);
  readonly languageError = signal(false);
  readonly logoutPending = signal(false);
  readonly logoutError = signal(false);

  /** Resizes the chosen picture in the browser, then uploads it. */
  async changePhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.photoBusy()) return;
    this.photoError.set('');
    if (file.size > MAX_SOURCE_BYTES) {
      this.photoError.set('settings.profile.tooLarge');
      return;
    }
    this.photoBusy.set(true);
    try {
      await firstValueFrom(this.profile.uploadAvatar(await this.resize(file)));
    } catch (error) {
      this.photoError.set(
        error instanceof UnreadableImageError ? 'settings.profile.unreadable' : 'settings.profile.failed',
      );
    } finally {
      this.photoBusy.set(false);
    }
  }

  async removePhoto(): Promise<void> {
    if (this.photoBusy()) return;
    this.photoError.set('');
    this.photoBusy.set(true);
    try {
      await firstValueFrom(this.profile.removeAvatar());
    } catch {
      this.photoError.set('settings.profile.failed');
    } finally {
      this.photoBusy.set(false);
    }
  }

  async chooseLanguage(locale: Locale): Promise<void> {
    this.languageError.set(false);
    this.languageError.set(!(await this.language.choose(locale)));
  }

  logout(): void {
    if (this.logoutPending()) return;
    this.logoutError.set(false);
    this.logoutPending.set(true);
    this.auth.logout().subscribe({
      next: () => {
        this.logoutPending.set(false);
        void this.router.navigateByUrl('/login');
      },
      error: () => {
        this.logoutPending.set(false);
        this.logoutError.set(true);
      },
    });
  }
}
