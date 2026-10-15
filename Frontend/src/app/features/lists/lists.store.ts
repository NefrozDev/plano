import { Injectable, computed, inject } from '@angular/core';
import type {
  ListDetail,
  ListEntry,
  ListSection,
  ListSettings,
  PlanoList,
  ShareRole,
} from '@plano/common';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { NEW_PERSON_COLOR, initialsOf } from '../../core/people/people';
import { APP_CLOCK, createId } from '../../core/time/dates';

export type { ListIcon, ListSettings, PlanoList } from '@plano/common';

export type InvitedRole = Exclude<ShareRole, 'owner'>;
export type EntryChanges = Partial<Omit<ListEntry, 'id'>>;

const addedAtFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
});

/**
 * Lists and their details. Every change goes through `updateDetail`, which
 * also keeps the overview's completed/total counts derived from the entries.
 */
@Injectable({ providedIn: 'root' })
export class ListsStore {
  private readonly appData = inject(PlanoDataStore);
  private readonly clock = inject(APP_CLOCK);

  readonly lists = computed(() => this.appData.data().lists);
  readonly settings = computed(() => this.appData.data().listSettings);

  list(slug: string): PlanoList | undefined {
    return this.lists().find((list) => list.slug === slug);
  }

  detail(slug: string): ListDetail | undefined {
    return this.appData.data().listDetails[slug];
  }

  updateList(slug: string, changes: Pick<PlanoList, 'name' | 'icon' | 'color'>): void {
    this.appData.update((data) => ({
      ...data,
      lists: data.lists.map((list) =>
        list.slug === slug
          ? { ...list, ...changes, surface: `color-mix(in srgb, ${changes.color} 9%, white)` }
          : list,
      ),
    }));
  }

  updateDescription(slug: string, description: string): void {
    this.updateDetail(slug, () => ({ description }));
  }

  addSection(slug: string, name: string, color: string): void {
    this.updateDetail(slug, ({ sections }) => ({
      sections: [...sections, { id: createId('section'), name, color, entries: [] }],
    }));
  }

  addEntry(slug: string, sectionId: string, name: string, addedBy: string): void {
    const entry: ListEntry = {
      id: createId('entry'),
      name,
      done: false,
      addedBy,
      addedAt: addedAtFormat.format(this.clock()),
      assignedTo: '',
      reminder: '',
      notes: '',
    };
    this.updateSection(slug, sectionId, (section) => ({
      ...section,
      entries: [...section.entries, entry],
    }));
  }

  updateEntry(slug: string, sectionId: string, entryId: string, changes: EntryChanges): void {
    this.updateSection(slug, sectionId, (section) => ({
      ...section,
      entries: section.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...changes } : entry,
      ),
    }));
  }

  toggleEntry(slug: string, sectionId: string, entryId: string): void {
    this.updateSection(slug, sectionId, (section) => ({
      ...section,
      entries: section.entries.map((entry) =>
        entry.id === entryId ? { ...entry, done: !entry.done } : entry,
      ),
    }));
  }

  removeEntry(slug: string, sectionId: string, entryId: string): void {
    this.updateSection(slug, sectionId, (section) => ({
      ...section,
      entries: section.entries.filter((entry) => entry.id !== entryId),
    }));
  }

  /** Moves an entry to the position of another entry of the same section. */
  moveEntry(slug: string, sectionId: string, entryId: string, targetEntryId: string): void {
    this.updateSection(slug, sectionId, (section) => {
      const from = section.entries.findIndex((entry) => entry.id === entryId);
      const to = section.entries.findIndex((entry) => entry.id === targetEntryId);
      if (from < 0 || to < 0 || from === to) return section;
      const entries = [...section.entries];
      const [moved] = entries.splice(from, 1);
      entries.splice(to, 0, moved);
      return { ...section, entries };
    });
  }

  /** Invites someone by e-mail; the display name is guessed from the address. */
  inviteMember(slug: string, email: string, role: InvitedRole): void {
    const address = email.trim();
    if (!address) return;
    const localPart = address.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const name = localPart
      ? localPart.replace(/\b\w/g, (letter) => letter.toUpperCase())
      : address;
    this.updateDetail(slug, ({ members }) => ({
      sharingEnabled: true,
      members: [
        ...members,
        { id: createId('member'), name, initials: initialsOf(name), color: NEW_PERSON_COLOR, role },
      ],
    }));
  }

  updateMemberRole(slug: string, memberId: string, role: ShareRole): void {
    this.updateDetail(slug, ({ members }) => ({
      members: members.map((member) =>
        member.id === memberId && member.role !== 'owner' ? { ...member, role } : member,
      ),
    }));
  }

  /** Turning sharing off also removes everyone but the owner. */
  setSharing(slug: string, enabled: boolean): void {
    this.updateDetail(slug, ({ members }) => ({
      sharingEnabled: enabled,
      members: enabled ? members : members.filter((member) => member.role === 'owner'),
    }));
  }

  updateSettings(changes: Partial<ListSettings>): void {
    this.appData.update((data) => ({
      ...data,
      listSettings: { ...data.listSettings, ...changes },
    }));
  }

  private updateSection(
    slug: string,
    sectionId: string,
    update: (section: ListSection) => ListSection,
  ): void {
    this.updateDetail(slug, ({ sections }) => ({
      sections: sections.map((section) => (section.id === sectionId ? update(section) : section)),
    }));
  }

  private updateDetail(slug: string, update: (detail: ListDetail) => Partial<ListDetail>): void {
    this.appData.update((data) => {
      const current = data.listDetails[slug];
      if (!current) return data;
      const next = { ...current, ...update(current) };
      const entries = next.sections.flatMap((section) => section.entries);
      return {
        ...data,
        lists: data.lists.map((list) =>
          list.slug === slug
            ? { ...list, completed: entries.filter((entry) => entry.done).length, total: entries.length }
            : list,
        ),
        listDetails: { ...data.listDetails, [slug]: next },
      };
    });
  }
}
