import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ListDetail, ListMemberRole } from '@plano/common';
import { AuthService } from '../../../core/auth/auth.service';
import type { GroupMember } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
import { toPerson } from '../../../core/people/people';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ListsStore } from '../lists.store';
import { ROLE_LABELS } from './list-options';

/**
 * Who can see the list. The owner shares it with members of their group and
 * manages roles; anyone else sees the members and can leave the list.
 */
@Component({
  selector: 'app-list-sharing-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-sharing-panel.component.html',
  styles: `:host { display: contents; }`,
})
export class ListSharingPanelComponent {
  private readonly store = inject(ListsStore);
  private readonly groups = inject(GroupsService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly list = input.required<ListDetail>();
  readonly close = output<void>();

  readonly roleLabels = ROLE_LABELS;
  readonly isOwner = computed(() => this.list().role === 'owner');
  readonly members = computed(() =>
    this.list().members.map((member) => ({ ...member, avatar: toPerson(member) })),
  );
  readonly inviteFormOpen = signal(false);
  readonly groupMembers = signal<readonly GroupMember[] | null>(null);
  /** Group mates who cannot see the list yet. */
  readonly candidates = computed(() =>
    (this.groupMembers() ?? []).filter(
      (member) => !this.list().members.some(({ id }) => id === member.id),
    ),
  );
  readonly inviteUserId = signal('');
  readonly inviteRole = signal<ListMemberRole>('editor');

  openInviteForm(): void {
    this.inviteFormOpen.set(true);
    this.groups.getMine().subscribe({
      next: (group) => {
        this.groupMembers.set(group?.members ?? []);
        this.inviteUserId.set(this.candidates()[0]?.id ?? '');
      },
      error: () => this.groupMembers.set([]),
    });
  }

  memberName(member: GroupMember): string {
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
