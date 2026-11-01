import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Person } from '../../core/people/people';
import { UserAvatarComponent } from './user-avatar.component';

export type AvatarPerson = Person;

/**
 * Overlapping faces, their picture or their initials, capped at `max` with a "+N" bubble.
 * The names are exposed once on the stack; size it with `--avatar-size`.
 */
@Component({
  selector: 'app-avatar-stack',
  imports: [UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (people().length) {
      <span class="avatars" role="img" [attr.aria-label]="label() || names()">
        @for (person of shown(); track person.id) {
          <app-user-avatar class="avatar" [user]="person" [size]="null" [attr.title]="person.name" />
        }
        @if (extra()) {
          <span class="avatar more" aria-hidden="true">+{{ extra() }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host { --avatar-size: 1.6rem; display: inline-flex; flex: none; }
    .avatars { display: flex; }
    .avatar { display: inline-grid; width: var(--avatar-size); height: var(--avatar-size); margin-left: -.3rem; place-items: center; border: 2px solid white; border-radius: 50%; color: white; font-size: calc(var(--avatar-size) * .36); font-weight: 750; }
    .avatar:first-child { margin-left: 0; }
    .avatar.more { background: #e9edf4; color: #5b6476; }
  `,
})
export class AvatarStackComponent {
  readonly people = input.required<readonly AvatarPerson[]>();
  readonly max = input(4);
  /** Accessible label; defaults to the comma-separated names. */
  readonly label = input('');

  readonly shown = computed(() => this.people().slice(0, this.max()));
  readonly extra = computed(() => Math.max(0, this.people().length - this.max()));
  readonly names = computed(() => this.people().map((person) => person.name).join(', '));
}
