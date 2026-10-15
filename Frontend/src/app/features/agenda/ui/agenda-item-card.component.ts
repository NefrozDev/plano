import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgendaContact } from '@plano/common';
import { AgendaStore } from '../agenda.store';
import { AgendaItem, timeRangeLabel } from '../agenda.utils';

const MAX_AVATARS = 2;

/** One agenda entry (event occurrence or dated task) as a tinted, clickable card. */
@Component({
  selector: 'app-agenda-item-card',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      class="card"
      [class.task]="item().kind === 'task'"
      [class.done]="item().done"
      [routerLink]="item().link"
      [queryParams]="item().queryParams"
      [style.--item-color]="item().color"
    >
      <span class="copy">
        <strong>
          @if (item().kind === 'task') {
            <i class="check" aria-hidden="true"></i><span class="visually-hidden">Tâche : </span>
          }
          {{ item().title }}
        </strong>
        <small>{{ caption() }}</small>
      </span>
      @if (people().length) {
        <span class="avatars" [attr.aria-label]="'Avec ' + peopleNames()">
          @for (person of people().slice(0, maxAvatars); track person.id) {
            <span class="avatar" [style.background]="person.color" aria-hidden="true">{{ person.initials }}</span>
          }
          @if (people().length > maxAvatars) {
            <span class="avatar more" aria-hidden="true">+{{ people().length - maxAvatars }}</span>
          }
        </span>
      }
    </a>
  `,
  styles: `
    :host { display: block; }
    .card { display: flex; gap: .6rem; align-items: center; padding: .6rem .7rem; border-left: 3px solid var(--item-color); border-radius: .55rem; background: color-mix(in srgb, var(--item-color) 11%, white); color: var(--color-text); text-decoration: none; }
    .card.task { border-left-style: dashed; background: white; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--item-color) 25%, white); }
    .copy { display: grid; flex: 1; gap: .15rem; min-width: 0; }
    strong { display: flex; gap: .35rem; align-items: center; overflow: hidden; color: color-mix(in srgb, var(--item-color) 70%, #111827); font-size: .78rem; text-overflow: ellipsis; white-space: nowrap; }
    small { overflow: hidden; color: #6b7385; font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; }
    .check { width: .8rem; height: .8rem; flex: none; border: 1.5px solid currentColor; border-radius: .2rem; }
    .done strong { text-decoration: line-through; opacity: .65; }
    .done .check { background: currentColor; }
    .avatars { display: flex; flex: none; }
    .avatar { display: grid; width: 1.5rem; height: 1.5rem; margin-left: -.3rem; place-items: center; border: 2px solid white; border-radius: 50%; color: white; font-size: .55rem; font-weight: 750; }
    .avatar.more { background: #e9edf4; color: #5b6476; }
  `,
})
export class AgendaItemCardComponent {
  private readonly store = inject(AgendaStore);

  readonly item = input.required<AgendaItem>();
  readonly maxAvatars = MAX_AVATARS;
  readonly people = computed(() =>
    this.item()
      .participantIds.map((id) => this.store.contact(id))
      .filter((contact): contact is AgendaContact => !!contact),
  );
  readonly peopleNames = computed(() => this.people().map((person) => person.name).join(', '));
  readonly caption = computed(() => {
    const item = this.item();
    const time = timeRangeLabel(item, this.store.settings().hourFormat);
    const detail = item.subtitle;
    return detail ? `${time} · ${detail}` : time;
  });
}
