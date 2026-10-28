import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { API_BASE_URL } from '../../core/http/api-base-url';
import { initialsOf, personColor } from '../../core/people/people';

/** Anyone shown with a face: the signed-in user, a friend, a group mate. */
export interface AvatarUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarVersion: number | null;
}

/**
 * The user's profile picture, or their initials on their colour when they have
 * none or it fails to load. Decorative: the surrounding control names the user.
 */
@Component({
  selector: 'app-user-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.--avatar-size.px]': 'size()',
    '[style.background]': 'src() ? null : color()',
  },
  template: `
    @if (src(); as url) {
      <img [src]="url" alt="" [width]="size()" [height]="size()" (error)="failed.set(true)" />
    } @else {
      {{ initials() }}
    }
  `,
  styles: `
    :host { display: inline-grid; width: var(--avatar-size); height: var(--avatar-size); flex: none; place-items: center; overflow: hidden; border-radius: 50%; color: white; font-size: calc(var(--avatar-size) * .38); font-weight: 750; line-height: 1; }
    img { width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class UserAvatarComponent {
  private readonly apiBase = inject(API_BASE_URL);

  readonly user = input.required<AvatarUser>();
  readonly size = input(40);

  /** A broken picture falls back to initials, until the user uploads a new one. */
  readonly failed = linkedSignal({ source: () => this.user().avatarVersion, computation: () => false });
  readonly src = computed(() => {
    const { id, avatarVersion } = this.user();
    return avatarVersion === null || this.failed() ? null : `${this.apiBase}/users/${id}/avatar?v=${avatarVersion}`;
  });
  readonly initials = computed(() => {
    const { firstName, lastName, username } = this.user();
    return initialsOf(firstName, lastName) || username.slice(0, 2).toUpperCase();
  });
  readonly color = computed(() => personColor(this.user().id));
}
