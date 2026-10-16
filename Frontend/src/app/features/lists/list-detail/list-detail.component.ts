import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ListEntry, ListSection } from '@plano/common';
import { AuthService } from '../../../core/auth/auth.service';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { AvatarStackComponent } from '../../../shared/ui/avatar-stack.component';
import { BottomNavComponent } from '../../../shared/ui/bottom-nav.component';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { EntryChanges, ListsStore } from '../lists.store';
import { ListEditorComponent, ListEdits } from './list-editor.component';
import { ListEntryDetailsComponent } from './list-entry-details.component';
import { ListEntryRowComponent } from './list-entry-row.component';
import { EntryRef, LIST_COLOR_CHOICES } from './list-options';
import { ListSectionCreatorComponent, NewSection } from './list-section-creator.component';
import { ListSharingPanelComponent } from './list-sharing-panel.component';

/** What the template shows for a section, given the display settings. */
export interface SectionView {
  section: ListSection;
  completed: number;
  progress: number;
  collapsed: boolean;
  entries: readonly ListEntry[];
}

function percent(part: number, whole: number): number {
  return whole ? (part / whole) * 100 : 0;
}

/**
 * Container for one list: reads it from ListsStore, keeps only screen state
 * (open panels, collapsed sections, selection, drag) and delegates the rest
 * to the entry row, editor, section creator, entry details and sharing panel.
 */
@Component({
  selector: 'app-list-detail',
  standalone: true,
  imports: [
    RouterLink,
    AutofocusDirective,
    AvatarStackComponent,
    BottomNavComponent,
    ListEditorComponent,
    ListEntryDetailsComponent,
    ListEntryRowComponent,
    ListSectionCreatorComponent,
    ListSharingPanelComponent,
  ],
  templateUrl: './list-detail.component.html',
  styleUrl: './list-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointermove)': 'moveDrag($event)',
    '(pointerup)': 'endDrag()',
    '(pointercancel)': 'endDrag()',
  },
})
export class ListDetailComponent {
  private readonly document = inject(DOCUMENT);
  private readonly store = inject(ListsStore);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';

  readonly list = computed(() => this.store.list(this.slug));
  private readonly detail = computed(() => this.store.detail(this.slug));
  readonly title = computed(() => this.list()?.name ?? 'Liste');
  readonly color = computed(() => this.list()?.color ?? LIST_COLOR_CHOICES[0]);
  readonly description = computed(() => this.detail()?.description ?? '');
  readonly members = computed(() => this.detail()?.members ?? []);
  readonly sections = computed(() => this.detail()?.sections ?? []);
  private readonly entries = computed(() => this.sections().flatMap((section) => section.entries));
  readonly completed = computed(() => this.entries().filter((entry) => entry.done).length);
  readonly total = computed(() => this.entries().length);
  readonly progress = computed(() => percent(this.completed(), this.total()));

  /** Ids of the sections shown as a one-line summary. */
  readonly collapsedSections = signal<readonly string[]>([]);
  readonly sectionViews = computed<readonly SectionView[]>(() => {
    const { showCompleted, completedLast } = this.store.settings();
    const collapsed = this.collapsedSections();
    return this.sections().map((section) => {
      const completed = section.entries.filter((entry) => entry.done).length;
      const visible = section.entries.filter((entry) => showCompleted || !entry.done);
      return {
        section,
        completed,
        progress: percent(completed, section.entries.length),
        collapsed: collapsed.includes(section.id),
        entries: completedLast
          ? [...visible].sort((first, second) => Number(first.done) - Number(second.done))
          : visible,
      };
    });
  });

  readonly listMenuOpen = signal(false);
  readonly listEditorOpen = signal(false);
  readonly sectionCreatorOpen = signal(false);
  readonly sharingOpen = signal(false);
  /** Section whose "new entry" input is shown. */
  readonly addingTo = signal<string | null>(null);
  readonly newEntryValue = signal('');
  readonly selected = signal<EntryRef | null>(null);
  readonly dragged = signal<EntryRef | null>(null);
  readonly activeEntry = computed(() => {
    const ref = this.selected();
    const section = this.sections().find(({ id }) => id === ref?.sectionId);
    const entry = section?.entries.find(({ id }) => id === ref?.entryId);
    return section && entry ? { section, entry } : null;
  });
  private readonly currentUserName = computed(
    () => this.auth.user()?.firstName || this.auth.user()?.username || 'Vous',
  );

  toggleSection(sectionId: string): void {
    this.collapsedSections.update((sections) =>
      sections.includes(sectionId)
        ? sections.filter((id) => id !== sectionId)
        : [...sections, sectionId],
    );
  }

  /** Completing the last entry of a section folds it away. */
  toggleEntry(sectionId: string, entryId: string): void {
    this.store.toggleEntry(this.slug, sectionId, entryId);
    const section = this.sections().find(({ id }) => id === sectionId);
    if (section?.entries.every((entry) => entry.done) && !this.collapsedSections().includes(sectionId)) {
      this.collapsedSections.update((sections) => [...sections, sectionId]);
    }
  }

  beginAdding(sectionId: string): void {
    this.newEntryValue.set('');
    this.addingTo.set(sectionId);
  }

  /** Also runs on blur, which can come late from a section that is no longer edited. */
  finishAdding(sectionId: string): void {
    if (this.addingTo() !== sectionId) return;
    const name = this.newEntryValue().trim();
    this.cancelAdding();
    if (name) this.store.addEntry(this.slug, sectionId, name, this.currentUserName());
  }

  cancelAdding(): void {
    this.addingTo.set(null);
    this.newEntryValue.set('');
  }

  toggleListMenu(): void {
    this.listMenuOpen.update((open) => !open);
  }

  openListEditor(): void {
    this.listMenuOpen.set(false);
    this.listEditorOpen.set(true);
  }

  saveList({ description, ...summary }: ListEdits): void {
    this.store.updateList(this.slug, summary);
    this.store.updateDescription(this.slug, description);
    this.listEditorOpen.set(false);
  }

  openSectionCreator(): void {
    this.listMenuOpen.set(false);
    this.sectionCreatorOpen.set(true);
  }

  addSection({ name, color }: NewSection): void {
    this.store.addSection(this.slug, name, color);
    this.sectionCreatorOpen.set(false);
  }

  openEntry(sectionId: string, entryId: string): void {
    this.selected.set({ sectionId, entryId });
  }

  updateActiveEntry(changes: EntryChanges): void {
    const ref = this.selected();
    if (ref) this.store.updateEntry(this.slug, ref.sectionId, ref.entryId, changes);
  }

  async requestDeleteEntry(sectionId: string, entry: ListEntry): Promise<void> {
    if (this.store.settings().confirmDelete) {
      const confirmed = await this.confirm.ask({
        heading: 'Supprimer l’élément ?',
        message: `« ${entry.name} » sera supprimé définitivement.`,
        confirmLabel: 'Supprimer',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    this.store.removeEntry(this.slug, sectionId, entry.id);
  }

  startDrag(sectionId: string, entryId: string): void {
    this.dragged.set({ sectionId, entryId });
  }

  /** Moves the dragged entry onto the row under the pointer, within its own section. */
  moveDrag(event: PointerEvent): void {
    const source = this.dragged();
    if (!source) return;
    event.preventDefault();
    const target = this.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.entry');
    const targetEntryId = target?.dataset['entryId'];
    if (
      !targetEntryId ||
      target.dataset['sectionId'] !== source.sectionId ||
      targetEntryId === source.entryId
    ) {
      return;
    }
    this.store.moveEntry(this.slug, source.sectionId, source.entryId, targetEntryId);
  }

  endDrag(): void {
    this.dragged.set(null);
  }
}
