
import { ChangeDetectionStrategy, Component, computed, inject, signal, DOCUMENT } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ListEntry, ListSection, UpdateEntryRequest } from '@plano/common';
import { toPerson } from '../../../core/people/people';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { AvatarStackComponent } from '../../../shared/ui/avatar-stack.component';
import { BottomNavComponent } from '../../../shared/ui/bottom-nav.component';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ToastComponent } from '../../../shared/ui/toast.component';
import { ListsStore } from '../lists.store';
import { ListEditorComponent, ListEdits } from './list-editor.component';
import { ListEntryDetailsComponent } from './list-entry-details.component';
import { ListEntryRowComponent } from './list-entry-row.component';
import { EntryRef } from './list-options';
import { ListSectionCreatorComponent, NewSection } from './list-section-creator.component';
import { ListSectionHeaderComponent } from './list-section-header.component';
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
 * Container for one list: loads it through ListsStore, keeps only screen
 * state (open panels, collapsed sections, selection, drag) and delegates the
 * rest to the entry row, editor, section creator, entry details and sharing
 * panel. What can be changed follows the user's role on the list.
 */
@Component({
  selector: 'app-list-detail',
  imports: [
    RouterLink,
    AutofocusDirective,
    AvatarStackComponent,
    BottomNavComponent,
    ListEditorComponent,
    ListEntryDetailsComponent,
    ListEntryRowComponent,
    ListSectionCreatorComponent,
    ListSectionHeaderComponent,
    ListSharingPanelComponent,
    ToastComponent,
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
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  readonly store = inject(ListsStore);
  private readonly listId: string;

  /** The open list, once loaded (never a previously opened one). */
  readonly list = computed(() => {
    const detail = this.store.detail();
    return detail?.id === this.listId ? detail : null;
  });
  readonly notFound = signal(false);
  readonly canEdit = computed(() => !!this.list() && this.list()?.role !== 'viewer');
  readonly isOwner = computed(() => this.list()?.role === 'owner');
  readonly people = computed(() => (this.list()?.members ?? []).map(toPerson));
  readonly progress = computed(() => percent(this.list()?.completed ?? 0, this.list()?.total ?? 0));

  /** Ids of the sections shown as a one-line summary. */
  readonly collapsedSections = signal<readonly string[]>([]);
  readonly sectionViews = computed<readonly SectionView[]>(() => {
    const settings = this.store.settings();
    const list = this.list();
    if (!settings || !list) return [];
    const collapsed = this.collapsedSections();
    return list.sections.map((section) => {
      const completed = section.entries.filter((entry) => entry.done).length;
      const visible = section.entries.filter((entry) => settings.showCompleted || !entry.done);
      return {
        section,
        completed,
        progress: percent(completed, section.entries.length),
        collapsed: collapsed.includes(section.id),
        entries: settings.completedLast
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
  readonly draggedSection = signal<string | null>(null);
  /** Whether the current drag reordered anything, i.e. needs saving. */
  private dragMoved = false;
  readonly activeEntry = computed(() => {
    const ref = this.selected();
    const section = this.list()?.sections.find(({ id }) => id === ref?.sectionId);
    const entry = section?.entries.find(({ id }) => id === ref?.entryId);
    return section && entry ? { section, entry } : null;
  });

  constructor() {
    const route = inject(ActivatedRoute).snapshot;
    this.listId = route.paramMap.get('listId') ?? '';
    const openEditor = route.queryParamMap.has('edit');
    void this.store.open(this.listId).then((found) => {
      this.notFound.set(!found);
      // A list created from the overview opens straight in its editor.
      if (found && openEditor && this.isOwner()) this.listEditorOpen.set(true);
    });
  }

  toggleSection(sectionId: string): void {
    this.collapsedSections.update((sections) =>
      sections.includes(sectionId)
        ? sections.filter((id) => id !== sectionId)
        : [...sections, sectionId],
    );
  }

  /** Completing the last entry of a section folds it away. */
  async toggleEntry(sectionId: string, entry: ListEntry): Promise<void> {
    if (!(await this.store.toggleEntry(entry))) return;
    const section = this.list()?.sections.find(({ id }) => id === sectionId);
    if (section?.entries.every(({ done }) => done) && !this.collapsedSections().includes(sectionId)) {
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
    if (name) void this.store.addEntry(sectionId, name);
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

  async saveList(edits: ListEdits): Promise<void> {
    if (await this.store.updateList(edits)) this.listEditorOpen.set(false);
  }

  async deleteList(): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Supprimer la liste ?',
      message: `« ${this.list()?.name} » et tous ses éléments seront supprimés pour tous ses membres.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (confirmed && (await this.store.deleteList())) {
      void this.router.navigateByUrl('/lists');
    }
  }

  openSharingFromEditor(): void {
    this.listEditorOpen.set(false);
    this.sharingOpen.set(true);
  }

  openSectionCreator(): void {
    this.listMenuOpen.set(false);
    this.sectionCreatorOpen.set(true);
  }

  async addSection({ name, color }: NewSection): Promise<void> {
    if (await this.store.addSection(name, color)) this.sectionCreatorOpen.set(false);
  }

  openEntry(sectionId: string, entryId: string): void {
    this.selected.set({ sectionId, entryId });
  }

  updateActiveEntry(changes: UpdateEntryRequest): void {
    const ref = this.selected();
    if (ref) void this.store.updateEntry(ref.entryId, changes);
  }

  renameSection(sectionId: string, name: string): void {
    void this.store.renameSection(sectionId, name);
  }

  /** Always confirmed, whatever the settings: every entry of the section goes with it. */
  async requestDeleteSection(section: ListSection): Promise<void> {
    const count = section.entries.length;
    const contents = count === 0 ? '' : count === 1 ? ' et son élément' : ` et ses ${count} éléments`;
    const confirmed = await this.confirm.ask({
      heading: 'Supprimer la section ?',
      message: `« ${section.name} »${contents} seront supprimés pour tous les membres de la liste.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (confirmed) await this.store.removeSection(section.id);
  }

  async requestDeleteEntry(entry: ListEntry): Promise<void> {
    if (this.store.settings()?.confirmDelete ?? true) {
      const confirmed = await this.confirm.ask({
        heading: 'Supprimer l’élément ?',
        message: `« ${entry.name} » sera supprimé définitivement.`,
        confirmLabel: 'Supprimer',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    await this.store.removeEntry(entry.id);
  }

  startDrag(sectionId: string, entryId: string): void {
    this.dragMoved = false;
    this.dragged.set({ sectionId, entryId });
  }

  /** Starts dragging a section; a pointer event comes from a collapsed section's own handle. */
  startSectionDrag(sectionId: string, event?: PointerEvent): void {
    if (event) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }
    this.dragMoved = false;
    this.draggedSection.set(sectionId);
  }

  /** Moves the dragged entry onto the row under the pointer, within its own section. */
  moveDrag(event: PointerEvent): void {
    if (this.draggedSection()) {
      this.moveSectionDrag(event);
      return;
    }
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
    this.store.moveEntry(source.sectionId, source.entryId, targetEntryId);
    this.dragMoved = true;
  }

  /** Saves the new order once, on drop. */
  endDrag(): void {
    if (this.draggedSection()) {
      this.draggedSection.set(null);
      if (this.dragMoved) void this.store.saveSectionOrder();
      return;
    }
    const source = this.dragged();
    if (!source) return;
    this.dragged.set(null);
    if (this.dragMoved) void this.store.saveOrder(source.sectionId);
  }

  /** Moves the dragged section onto the section under the pointer, collapsed or open. */
  private moveSectionDrag(event: PointerEvent): void {
    event.preventDefault();
    const sourceId = this.draggedSection();
    const targetId = this.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.section-block')?.dataset['sectionId'];
    if (!sourceId || !targetId || targetId === sourceId) return;
    this.store.moveSection(sourceId, targetId);
    this.dragMoved = true;
  }
}
