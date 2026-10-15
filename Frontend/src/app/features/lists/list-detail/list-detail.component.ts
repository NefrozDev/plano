import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ListEntry, ListMember, ListSection, ShareRole } from '@plano/common';
import { createId } from '../../../core/time/dates';
import { AvatarStackComponent } from '../../../shared/ui/avatar-stack.component';
import { BottomNavComponent } from '../../../shared/ui/bottom-nav.component';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ListIcon, ListsStore } from '../lists.store';

const LIST_NAMES: Readonly<Record<string, string>> = {
  courses: 'Courses',
  maison: 'Maison',
  'vacances-ete': 'Vacances été',
  'idees-cadeaux': 'Idées cadeaux',
  'projets-maison': 'Projets maison',
};

function createEntry(
  name: string,
  done = false,
  extras: Partial<ListEntry> = {},
): ListEntry {
  return {
    id: createId('entry'),
    name,
    done,
    addedBy: 'Camille',
    addedAt: '13 août 2024 à 11:20',
    assignedTo: 'Alex',
    reminder: '',
    notes: '',
    ...extras,
  };
}

@Component({
  selector: 'app-list-detail',
  standalone: true,
  imports: [RouterLink, AvatarStackComponent, BottomNavComponent],
  templateUrl: './list-detail.component.html',
  styleUrl: './list-detail.component.scss',
  host: {
    '(pointermove)': 'movePointerDrag($event)',
    '(pointerup)': 'endDrag()',
    '(pointercancel)': 'endDrag()',
  },
})
export class ListDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly listsStore = inject(ListsStore);
  private readonly confirm = inject(ConfirmService);
  private readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';
  private readonly currentList = this.listsStore.list(this.slug);
  private readonly currentDetail = this.listsStore.detail(this.slug);

  readonly title = signal(
    this.currentList?.name ?? LIST_NAMES[this.slug] ?? 'Liste',
  );
  readonly listMenuOpen = signal(false);
  readonly listEditorOpen = signal(false);
  readonly draftName = signal(this.title());
  readonly description = signal(this.currentDetail?.description ?? '');
  readonly selectedIcon = signal<ListIcon>(this.currentList?.icon ?? 'cart');
  readonly listColor = signal(this.currentList?.color ?? '#23c666');
  readonly iconChoices: readonly { value: ListIcon; label: string }[] = [
    { value: 'cart', label: 'Courses' },
    { value: 'home', label: 'Maison' },
    { value: 'suitcase', label: 'Voyage' },
    { value: 'gift', label: 'Cadeaux' },
    { value: 'tools', label: 'Travaux' },
  ];
  readonly colorChoices: readonly string[] = [
    '#2ecb70',
    '#7868ef',
    '#f4a51c',
    '#e65591',
    '#3978ed',
  ];
  readonly collapsedSections = signal<readonly string[]>([]);
  readonly editingSection = signal<number | null>(null);
  readonly newEntryValue = signal('');
  readonly draggedEntry = signal<{
    sectionIndex: number;
    entryIndex: number;
  } | null>(null);
  readonly revealedEntry = signal<{
    sectionIndex: number;
    entryIndex: number;
  } | null>(null);
  readonly swipeGesture = signal<{
    sectionIndex: number;
    entryIndex: number;
    startX: number;
    currentX: number;
  } | null>(null);
  readonly suppressEntryClick = signal<{
    sectionIndex: number;
    entryIndex: number;
  } | null>(null);
  readonly selectedEntry = signal<{
    sectionIndex: number;
    entryIndex: number;
  } | null>(null);
  readonly sectionCreatorOpen = signal(false);
  readonly newSectionName = signal('');
  readonly newSectionColor = signal(this.colorChoices[0]);
  readonly sharingOpen = signal(false);
  readonly inviteFormOpen = signal(false);
  readonly inviteEmail = signal('');
  readonly inviteRole = signal<Exclude<ShareRole, 'owner'>>('editor');
  readonly sharingEnabled = signal(this.currentDetail?.sharingEnabled ?? false);
  readonly linkCopied = signal(false);
  readonly invitationLink = `plano.app/l/${this.slug}-a1b2c3`;
  readonly members = signal<ListMember[]>(this.currentDetail?.members ?? []);
  readonly sections = signal<ListSection[]>(this.currentDetail?.sections ?? []);
  readonly completed = computed(() =>
    this.sections().reduce(
      (total, section) =>
        total + section.entries.filter((entry) => entry.done).length,
      0,
    ),
  );
  readonly total = signal(this.currentDetail?.total ?? 0);

  private persistDetail(): void {
    this.listsStore.updateDetail(this.slug, {
      description: this.description(),
      sections: this.sections(),
      members: this.members(),
      sharingEnabled: this.sharingEnabled(),
      total: this.total(),
    });
  }

  toggleSection(sectionName: string): void {
    this.collapsedSections.update((sections) =>
      sections.includes(sectionName)
        ? sections.filter((name) => name !== sectionName)
        : [...sections, sectionName],
    );
  }

  isSectionCollapsed(sectionName: string): boolean {
    return this.collapsedSections().includes(sectionName);
  }

  toggleEntry(sectionIndex: number, entryIndex: number): void {
    this.sections.update((sections) =>
      sections.map((section, currentSectionIndex) =>
        currentSectionIndex !== sectionIndex
          ? section
          : {
              ...section,
              entries: section.entries.map((entry, currentEntryIndex) =>
                currentEntryIndex === entryIndex
                  ? { ...entry, done: !entry.done }
                  : entry,
              ),
            },
      ),
    );

    const updatedSection = this.sections()[sectionIndex];
    if (updatedSection.entries.every((entry) => entry.done)) {
      this.collapsedSections.update((sections) =>
        sections.includes(updatedSection.name)
          ? sections
          : [...sections, updatedSection.name],
      );
    }
    this.persistDetail();
  }

  sectionCompleted(section: ListSection): number {
    return section.entries.filter((entry) => entry.done).length;
  }

  sectionProgress(section: ListSection): number {
    return section.entries.length
      ? (this.sectionCompleted(section) / section.entries.length) * 100
      : 0;
  }

  displayedEntries(section: ListSection): readonly {
    entry: ListEntry;
    index: number;
  }[] {
    const entries = section.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => this.listsStore.settings().showCompleted || !entry.done);

    return this.listsStore.settings().completedLast
      ? [...entries].sort((first, second) => Number(first.entry.done) - Number(second.entry.done))
      : entries;
  }

  startPointerDrag(
    sectionIndex: number,
    entryIndex: number,
    event: PointerEvent,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.revealedEntry.set(null);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.draggedEntry.set({ sectionIndex, entryIndex });
  }

  movePointerDrag(event: PointerEvent): void {
    const source = this.draggedEntry();
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    const target = this.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.entry');
    const sectionIndex = Number(target?.dataset['sectionIndex']);
    const entryIndex = Number(target?.dataset['entryIndex']);
    if (
      !target ||
      sectionIndex !== source.sectionIndex ||
      entryIndex === source.entryIndex
    ) {
      return;
    }
    this.reorderEntry(sectionIndex, source.entryIndex, entryIndex);
    this.draggedEntry.set({ sectionIndex, entryIndex });
  }

  endDrag(): void {
    this.draggedEntry.set(null);
  }

  finishPointerDrag(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.endDrag();
  }

  reorderEntry(sectionIndex: number, fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    this.sections.update((sections) =>
      sections.map((section, currentSectionIndex) => {
        if (currentSectionIndex !== sectionIndex) return section;
        const entries = [...section.entries];
        const [movedEntry] = entries.splice(fromIndex, 1);
        entries.splice(toIndex, 0, movedEntry);
        return { ...section, entries };
      }),
    );
    this.persistDetail();
  }

  beginAdding(sectionIndex: number): void {
    this.newEntryValue.set('');
    this.editingSection.set(sectionIndex);
    requestAnimationFrame(() => {
      this.document
        .querySelector<HTMLInputElement>(
          `[data-new-entry-section="${sectionIndex}"]`,
        )
        ?.focus();
    });
  }

  finishAdding(sectionIndex: number): void {
    if (this.editingSection() !== sectionIndex) return;
    const name = this.newEntryValue().trim();
    this.editingSection.set(null);
    this.newEntryValue.set('');
    if (!name) return;
    this.sections.update((sections) =>
      sections.map((section, currentSectionIndex) =>
        currentSectionIndex === sectionIndex
          ? { ...section, entries: [...section.entries, createEntry(name)] }
          : section,
      ),
    );
    this.total.update((total) => total + 1);
    this.persistDetail();
  }

  cancelAdding(): void {
    this.editingSection.set(null);
    this.newEntryValue.set('');
  }

  toggleListMenu(): void {
    this.listMenuOpen.update((open) => !open);
  }

  openSectionCreator(): void {
    this.listMenuOpen.set(false);
    this.newSectionName.set('');
    this.newSectionColor.set(this.colorChoices[0]);
    this.sectionCreatorOpen.set(true);
    requestAnimationFrame(() =>
      this.document.querySelector<HTMLInputElement>('[data-new-section-name]')?.focus(),
    );
  }

  closeSectionCreator(): void {
    this.sectionCreatorOpen.set(false);
    this.newSectionName.set('');
  }

  saveSection(): void {
    const name = this.newSectionName().trim();
    if (!name) return;
    this.sections.update((sections) => [
      ...sections,
      { id: createId('section'), name, color: this.newSectionColor(), entries: [] },
    ]);
    this.persistDetail();
    this.closeSectionCreator();
  }

  openSharing(): void {
    this.sharingOpen.set(true);
    this.inviteFormOpen.set(false);
    this.linkCopied.set(false);
  }

  closeSharing(): void {
    this.sharingOpen.set(false);
    this.inviteFormOpen.set(false);
    this.inviteEmail.set('');
  }

  inviteMember(): void {
    const email = this.inviteEmail().trim();
    if (!email) return;
    const rawName = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const name = rawName
      ? rawName.replace(/\b\w/g, (letter) => letter.toUpperCase())
      : email;
    this.members.update((members) => [
      ...members,
      {
        id: `${Date.now()}`,
        name,
        initials: name.slice(0, 1).toUpperCase(),
        color: '#6387ED',
        role: this.inviteRole(),
      },
    ]);
    this.sharingEnabled.set(true);
    this.inviteEmail.set('');
    this.inviteFormOpen.set(false);
    this.persistDetail();
  }

  updateMemberRole(memberId: string, role: ShareRole): void {
    this.members.update((members) =>
      members.map((member) =>
        member.id === memberId && member.role !== 'owner'
          ? { ...member, role }
          : member,
      ),
    );
    this.persistDetail();
  }

  roleLabel(role: ShareRole): string {
    return role === 'owner'
      ? 'Propriétaire'
      : role === 'editor'
        ? 'Peut modifier'
        : 'Peut consulter';
  }

  async copyInvitationLink(): Promise<void> {
    await this.document.defaultView?.navigator.clipboard?.writeText(
      `https://${this.invitationLink}`,
    );
    this.linkCopied.set(true);
  }

  stopSharing(): void {
    this.members.update((members) =>
      members.filter((member) => member.role === 'owner'),
    );
    this.sharingEnabled.set(false);
    this.inviteFormOpen.set(false);
    this.persistDetail();
  }

  enableSharing(): void {
    this.sharingEnabled.set(true);
    this.persistDetail();
  }

  openListEditor(): void {
    this.draftName.set(this.title());
    this.listMenuOpen.set(false);
    this.listEditorOpen.set(true);
  }

  closeListEditor(): void {
    this.draftName.set(this.title());
    this.listEditorOpen.set(false);
  }

  saveListEditor(): void {
    const name = this.draftName().trim();
    if (name) this.title.set(name);
    this.listsStore.updateList(this.slug, {
      name: this.title(),
      icon: this.selectedIcon(),
      color: this.listColor(),
    });
    this.persistDetail();
    this.listEditorOpen.set(false);
  }

  startSwipe(
    sectionIndex: number,
    entryIndex: number,
    event: PointerEvent,
  ): void {
    const target = event.target as HTMLElement;
    if (target.closest('.drag-handle') || target.closest('.entry-toggle')) return;
    const revealed = this.revealedEntry();
    if (
      revealed?.sectionIndex === sectionIndex &&
      revealed.entryIndex === entryIndex
    ) {
      this.suppressEntryClick.set({ sectionIndex, entryIndex });
    }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.swipeGesture.set({
      sectionIndex,
      entryIndex,
      startX: event.clientX,
      currentX: event.clientX,
    });
  }

  moveSwipe(event: PointerEvent): void {
    const gesture = this.swipeGesture();
    if (!gesture) return;
    const distance = event.clientX - gesture.startX;
    if (Math.abs(distance) > 6) event.preventDefault();
    this.swipeGesture.set({ ...gesture, currentX: event.clientX });
  }

  finishSwipe(): void {
    const gesture = this.swipeGesture();
    if (!gesture) return;
    const distance = gesture.currentX - gesture.startX;
    if (Math.abs(distance) > 6) {
      this.suppressEntryClick.set({
        sectionIndex: gesture.sectionIndex,
        entryIndex: gesture.entryIndex,
      });
    }
    this.swipeGesture.set(null);
    if (distance < -32) {
      void this.requestDeleteEntry(gesture.sectionIndex, gesture.entryIndex);
      return;
    }
    this.revealedEntry.set(null);
  }

  swipeOffset(sectionIndex: number, entryIndex: number): number {
    const gesture = this.swipeGesture();
    if (
      gesture?.sectionIndex === sectionIndex &&
      gesture.entryIndex === entryIndex
    ) {
      return Math.max(-58, Math.min(0, gesture.currentX - gesture.startX));
    }
    const revealed = this.revealedEntry();
    return revealed?.sectionIndex === sectionIndex &&
      revealed.entryIndex === entryIndex
      ? -58
      : 0;
  }

  handleEntryClick(
    event: MouseEvent,
    sectionIndex: number,
    entryIndex: number,
  ): void {
    const revealed = this.revealedEntry();
    if (
      revealed?.sectionIndex === sectionIndex &&
      revealed.entryIndex === entryIndex
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.revealedEntry.set(null);
      this.suppressEntryClick.set(null);
      return;
    }
    const suppressed = this.suppressEntryClick();
    if (
      suppressed?.sectionIndex === sectionIndex &&
      suppressed.entryIndex === entryIndex
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressEntryClick.set(null);
      return;
    }
    this.selectedEntry.set({ sectionIndex, entryIndex });
  }

  activeEntry(): ListEntry | null {
    const selection = this.selectedEntry();
    return selection
      ? this.sections()[selection.sectionIndex]?.entries[selection.entryIndex] ?? null
      : null;
  }

  activeEntrySection(): ListSection | null {
    const selection = this.selectedEntry();
    return selection ? this.sections()[selection.sectionIndex] ?? null : null;
  }

  closeEntryDetails(): void {
    this.selectedEntry.set(null);
  }

  updateSelectedEntry(changes: Partial<ListEntry>): void {
    const selection = this.selectedEntry();
    if (!selection) return;
    this.sections.update((sections) =>
      sections.map((section, sectionIndex) =>
        sectionIndex !== selection.sectionIndex
          ? section
          : {
              ...section,
              entries: section.entries.map((entry, entryIndex) =>
                entryIndex === selection.entryIndex
                  ? { ...entry, ...changes }
                  : entry,
              ),
            },
      ),
    );
    this.persistDetail();
  }

  deleteEntry(sectionIndex: number, entryIndex: number): void {
    this.sections.update((sections) =>
      sections.map((section, currentSectionIndex) =>
        currentSectionIndex === sectionIndex
          ? {
              ...section,
              entries: section.entries.filter(
                (_entry, currentEntryIndex) => currentEntryIndex !== entryIndex,
              ),
            }
          : section,
      ),
    );
    this.total.update((total) => Math.max(0, total - 1));
    this.revealedEntry.set(null);
    this.suppressEntryClick.set(null);
    this.persistDetail();
  }

  async requestDeleteEntry(sectionIndex: number, entryIndex: number): Promise<void> {
    const entry = this.sections()[sectionIndex]?.entries[entryIndex];
    if (!entry) return;
    if (this.listsStore.settings().confirmDelete) {
      const confirmed = await this.confirm.ask({
        heading: 'Supprimer l’élément ?',
        message: `« ${entry.name} » sera supprimé définitivement.`,
        confirmLabel: 'Supprimer',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    this.deleteEntry(sectionIndex, entryIndex);
  }
}
