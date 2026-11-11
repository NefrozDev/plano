import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { finalize } from 'rxjs';
import type { GroupDetails } from '../../core/groups/group.models';
import { GroupsService } from '../../core/groups/groups.service';
import { CountPipe } from '../../core/i18n/translate';

/**
 * Groups section of the Social tab: the user's groups, each opening its page,
 * and the way to create or join one (the `/groups` page).
 */
@Component({
  selector: 'app-social-groups',
  imports: [CountPipe, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 id="social-groups-heading">{{ 'social.groups.heading' | transloco }}</h2>

    @if (loading()) {
      <p class="note" role="status">{{ 'groups.loading' | transloco }}</p>
    } @else if (failed()) {
      <p class="field-error" role="alert">{{ 'social.groups.failed' | transloco }}</p>
      <button class="retry" type="button" (click)="load()">{{ 'social.groups.retry' | transloco }}</button>
    } @else {
      <ul class="groups">
        @for (group of groups(); track group.id) {
          <li>
            <a class="group" [routerLink]="['/groups', group.id]">
              <span class="emblem" aria-hidden="true">
                <svg viewBox="0 0 48 48">
                  <circle cx="18" cy="17" r="7" />
                  <circle cx="33" cy="20" r="5" />
                  <path d="M5 39c0-9 5-13 13-13s13 4 13 13M27 30c2-2 4-3 7-3 6 0 9 4 9 11" />
                </svg>
              </span>
              <span class="copy">
                <strong>{{ group.name }}</strong>
                <small>{{ 'groups.members' | count: group.members.length }}</small>
              </span>
              <span class="role">{{ (group.role === 'owner' ? 'groups.owner' : 'groups.member') | transloco }}</span>
              <span class="chevron" aria-hidden="true">›</span>
            </a>
          </li>
        } @empty {
          <li class="note">{{ 'social.groups.none' | transloco }}</li>
        }
      </ul>
    }

    <a class="manage" routerLink="/groups">{{ 'social.groups.manage' | transloco }}</a>
  `,
  styles: `
    :host { display: grid; gap: .6rem; }
    h2 { margin: 0 0 .1rem; color: #586174; font-size: .72rem; font-weight: 750; }
    .groups { display: grid; margin: 0; padding: 0; list-style: none; }
    .groups li { border-bottom: 1px solid #f0f2f6; }
    .groups li:last-child { border-bottom: 0; }
    .group { display: grid; min-height: 3.6rem; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: .65rem; align-items: center; padding: .35rem 0; color: var(--color-text); text-decoration: none; }
    .emblem { display: grid; width: 2.25rem; height: 2.25rem; place-items: center; border-radius: 50%; background: #eef3ff; color: var(--color-primary); }
    .emblem svg { width: 1.45rem; height: 1.45rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 3; }
    .copy { display: grid; min-width: 0; }
    .copy strong { font-size: .85rem; overflow-wrap: anywhere; }
    .copy small, .role { color: var(--color-text-muted); font-size: .72rem; }
    .role { font-weight: 650; }
    .chevron { color: var(--color-text-muted); }
    .note { margin: 0; padding: .6rem 0; color: var(--color-text-muted); font-size: .78rem; }
    .field-error { margin: 0; }
    .retry, .manage { display: inline-flex; min-height: 2.6rem; align-items: center; justify-content: center; padding: 0 .95rem; border: 0; border-radius: .7rem; cursor: pointer; font: inherit; font-size: .8rem; font-weight: 700; text-decoration: none; }
    .retry { justify-self: start; background: #f2f4f8; color: #394254; }
    .manage { margin-top: .4rem; background: var(--color-primary); color: white; }
  `,
})
export class SocialGroupsComponent {
  private readonly groupsApi = inject(GroupsService);

  readonly groups = signal<readonly GroupDetails[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.groupsApi
      .getAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (groups) => this.groups.set(groups),
        error: () => this.failed.set(true),
      });
  }
}
