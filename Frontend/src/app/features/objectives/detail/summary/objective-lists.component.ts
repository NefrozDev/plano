import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ObjectiveDetail, ObjectiveLinkedList } from '@plano/common';
import { ConfirmService } from '../../../../shared/ui/confirm.service';
import { AutofocusDirective } from '../../../../shared/ui/autofocus.directive';
import { LIST_COLOR_CHOICES } from '../../../lists/list-detail/list-options';
import { ListsStore } from '../../../lists/lists.store';
import { ObjectivesStore } from '../../objectives.store';

/**
 * The lists of an objective: a shortcut to each, and with the "Liste" mode, what
 * makes its bar. The owner creates a list from here or links one of their own.
 */
@Component({
  selector: 'app-objective-lists',
  imports: [AutofocusDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (objective(); as objective) {
      @if (objective.lists.length || owner()) {
        <section class="lists" aria-labelledby="lists-title">
          <div class="heading">
            <h3 id="lists-title">Listes</h3>
            @if (objective.completion === 'list' && objective.amount; as amount) {
              <span>{{ amount.current }} / {{ amount.target }} cochés</span>
            }
          </div>

          @for (list of objective.lists; track list.id) {
            <div class="list-row" [style.--list-color]="list.color">
              <a [routerLink]="['/lists', list.id]">
                <i class="dot" aria-hidden="true"></i>
                <span class="name">{{ list.name }}</span>
                <span class="count">{{ list.done }} / {{ list.total }}</span>
              </a>
              @if (owner()) {
                <button class="unlink" type="button" [attr.aria-label]="'Retirer « ' + list.name + ' » de l’objectif'" (click)="unlink(list)">×</button>
              }
            </div>
            @if (list.removeChecked && objective.completion === 'list') {
              <p class="note">Ses éléments cochés sont supprimés : elle ne compte pas dans la barre.</p>
            }
          }
          @if (!objective.lists.length && objective.completion === 'list') {
            <p class="note">Ajoutez une liste : ses éléments cochés feront avancer la barre.</p>
          }

          @if (owner()) {
            @switch (mode()) {
              @case ('new') {
                <form class="new-list" (submit)="$event.preventDefault(); create(name.value)">
                  <input #name class="form-control" appAutofocus maxlength="80" aria-label="Nom de la nouvelle liste" placeholder="Nom de la liste" />
                  <button class="primary" type="submit" [disabled]="busy()">Créer</button>
                  <button class="secondary" type="button" (click)="mode.set('idle')">Annuler</button>
                </form>
              }
              @case ('link') {
                <div class="picker" role="group" aria-label="Choisir une liste à lier">
                  @for (list of available(); track list.id) {
                    <button type="button" [style.--list-color]="list.color" [disabled]="busy()" (click)="link(list.id)">
                      <i class="dot" aria-hidden="true"></i>{{ list.name }}
                    </button>
                  } @empty {
                    <p class="note">Aucune autre de vos listes ne peut être liée : chacune compte pour un objectif au plus.</p>
                  }
                  <button class="secondary" type="button" (click)="mode.set('idle')">Annuler</button>
                </div>
              }
              @default {
                <div class="actions">
                  <button type="button" (click)="mode.set('new')">＋ Nouvelle liste</button>
                  <button type="button" (click)="openPicker()">Lier une liste</button>
                </div>
              }
            }
          }
        </section>
      }
    }
  `,
  styles: `
    .lists { display: grid; gap: .5rem; margin-top: 1.2rem; }
    .heading { display: flex; align-items: baseline; justify-content: space-between; }
    h3 { margin: 0; font-size: .92rem; }
    .heading span { color: var(--color-text-muted); font-size: .75rem; font-weight: 650; }
    .list-row { display: flex; gap: .4rem; align-items: center; }
    .list-row a { display: flex; flex: 1; gap: .6rem; align-items: center; min-width: 0; padding: .7rem .8rem; border: 1px solid #e4e8f0; border-radius: .8rem; background: white; color: var(--color-text); text-decoration: none; }
    .dot { width: .7rem; height: .7rem; flex: none; border-radius: 50%; background: var(--list-color); }
    .name { flex: 1; overflow: hidden; font-size: .84rem; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .count { color: var(--color-text-muted); font-size: .75rem; font-weight: 650; }
    .unlink { width: 2.2rem; height: 2.2rem; border: 0; border-radius: .6rem; background: #f2f4f8; color: #6b7385; cursor: pointer; font-size: 1.05rem; }
    .note { margin: 0; color: var(--color-text-muted); font-size: .74rem; line-height: 1.4; }
    .actions { display: flex; flex-wrap: wrap; gap: 1rem; }
    .actions button { padding: .35rem 0; border: 0; background: none; color: var(--color-primary); cursor: pointer; font: inherit; font-size: .78rem; font-weight: 700; }
    .new-list { display: grid; grid-template-columns: 1fr auto auto; gap: .4rem; }
    .picker { display: flex; flex-wrap: wrap; gap: .4rem; }
    .picker button:not(.secondary) { display: inline-flex; gap: .45rem; align-items: center; padding: .5rem .75rem; border: 1px solid #dce5f5; border-radius: 2rem; background: white; color: var(--color-text); cursor: pointer; font: inherit; font-size: .78rem; font-weight: 650; }
    .primary, .secondary { padding: 0 .8rem; border-radius: .6rem; cursor: pointer; font: inherit; font-size: .78rem; font-weight: 700; }
    .primary { border: 0; background: var(--color-primary); color: white; }
    .secondary { min-height: 2.2rem; border: 1px solid var(--color-border); background: white; color: var(--color-text); }
  `,
})
export class ObjectiveListsComponent {
  private readonly store = inject(ObjectivesStore);
  private readonly listsStore = inject(ListsStore);
  private readonly confirm = inject(ConfirmService);

  readonly objective = input.required<ObjectiveDetail>();
  /** Only the owner links, creates and removes lists. */
  readonly owner = input(false);
  readonly mode = signal<'idle' | 'new' | 'link'>('idle');
  readonly busy = signal(false);
  /** The owner's own lists that count for no objective yet. */
  readonly available = computed(() =>
    this.listsStore.lists().filter((list) => list.ownership === 'mine' && !list.objectiveId && !list.archived),
  );

  openPicker(): void {
    this.mode.set('link');
    void this.listsStore.loadLists();
  }

  async create(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed || this.busy()) return;
    const colors = LIST_COLOR_CHOICES;
    await this.run(() =>
      this.store.createList(this.objective().id, {
        name: trimmed,
        icon: 'cart',
        color: colors[this.objective().lists.length % colors.length],
      }),
    );
  }

  async link(listId: string): Promise<void> {
    await this.run(() => this.store.linkList(this.objective().id, listId));
  }

  async unlink(list: ObjectiveLinkedList): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Retirer la liste',
      message: `« ${list.name} » ne comptera plus pour cet objectif. Elle reste dans vos listes.`,
      confirmLabel: 'Retirer',
    });
    if (confirmed) await this.store.unlinkList(this.objective().id, list.id);
  }

  /** Saves, then closes the form and lets the lists screen know which lists are now taken. */
  private async run(save: () => Promise<boolean>): Promise<void> {
    this.busy.set(true);
    const saved = await save();
    this.busy.set(false);
    if (!saved) return;
    this.mode.set('idle');
    void this.listsStore.loadLists();
  }
}
