import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ListDetail, ListMemberRole } from '@plano/common';
import { AuthService } from '../../../core/auth/auth.service';
import type { Contact } from '@plano/common';
import { FriendsService } from '../../../core/friends/friends.service';
import { toPerson } from '../../../core/people/people';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ListsStore } from '../lists.store';
import { ROLE_LABELS } from './list-options';

/**
 * Who can see the list. The owner shares it with their friends and group mates and
 * manages roles; anyone else sees the members and can leave the list.
 */
@Component({
  selector: 'app-list-sharing-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-sharing-panel.component.html',
  styles: `:host { display: contents; }`,
})
export class ListSharingPanelComponent {
  private readonly store = inject(ListsStore);
  private readonly friends = inject(FriendsService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly list = input.required<ListDetail>();
  readonly closed = output<void>();

  readonly roleLabels = ROLE_LABELS;
  readonly isOwner = computed(() => this.list().role === 'owner');
  readonly members = computed(() =>
    this.list().members.map((member) => ({ ...member, avatar: toPerson(member) })),
  );
  readonly inviteFormOpen = signal(false);
  /** The owner's contacts (friends and group mates); null while loading. */
  readonly contacts = signal<readonly Contact[] | null>(null);
  /** Contacts who cannot see the list yet. */
  readonly candidates = computed(() =>
    (this.contacts() ?? []).filter(
      (member) => !this.list().members.some(({ id }) => id === member.id),
    ),
  );
  readonly inviteUserId = signal('');
  readonly inviteRole = signal<ListMemberRole>('editor');

  openInviteForm(): void {
    this.inviteFormOpen.set(true);
    this.friends.contacts().subscribe({
      next: (contacts) => {
        this.contacts.set(contacts);
        this.inviteUserId.set(this.candidates()[0]?.id ?? '');
      },
      error: () => this.contacts.set([]),
    });
  }

  memberName(member: Contact): string {
    return `${member.firstName} ${member.lastName}`.trim() || member.username;
  }

  async invite(): Promise<void> {
    if (!this.inviteUserId()) return;
    if (await this.store.addMember(this.inviteUserId(), this.inviteRole())) {
      this.inviteFormOpen.set(false);
    }
  }

  updateRole(userId: string, role: ListMemberRole): void {
    void this.store.updateMemberRole(userId, role);
  }

  removeMember(userId: string): void {
    void this.store.removeMember(userId);
  }

  async stopSharing(): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Arrêter le partage ?',
      message: 'Plus personne d’autre que vous n’aura accès à la liste.',
      confirmLabel: 'Arrêter',
      tone: 'danger',
    });
    if (confirmed) await this.store.stopSharing();
  }

  async leave(): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Quitter la liste ?',
      message: 'Vous n’y aurez plus accès, sauf si elle est partagée à nouveau.',
      confirmLabel: 'Quitter',
      tone: 'danger',
    });
    if (confirmed && (await this.store.removeMember(this.auth.user()?.id ?? ''))) {
      void this.router.navigateByUrl('/lists');
    }
  }
}
