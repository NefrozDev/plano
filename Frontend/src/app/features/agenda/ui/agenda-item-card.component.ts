import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AgendaContact } from '@plano/common';
import { AvatarStackComponent } from '../../../shared/ui/avatar-stack.component';
import { AgendaStore } from '../agenda.store';
import { AgendaItem, timeRangeLabel } from '../agenda.utils';

const MAX_AVATARS = 2;

/** One agenda entry (event occurrence or dated task) as a tinted, clickable card. */
@Component({
  selector: 'app-agenda-item-card',
  standalone: true,
  imports: [RouterLink, AvatarStackComponent],
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
      <app-avatar-stack [people]="people()" [max]="maxAvatars" [label]="'Avec ' + peopleNames()" />
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
    app-avatar-stack { --avatar-size: 1.5rem; }
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
