import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { Contact, ObjectiveMemberRole, ObjectiveRole } from '@plano/common';
import { firstValueFrom } from 'rxjs';
import { FriendsService } from '../../../core/friends/friends.service';
import { toPerson } from '../../../core/people/people';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { objectiveTint } from '../objective.utils';
import { ObjectivesStore } from '../objectives.store';
import { ObjectiveIconComponent } from '../ui/objective-icon.component';
import { contactName } from '../ui/people-picker.component';

export const OBJECTIVE_ROLE_LABELS: Readonly<Record<ObjectiveRole, string>> = {
  owner: 'Propriétaire',
  contributor: 'Peut contribuer',
  viewer: 'Peut consulter',
};

/**
 * Who can open an objective, at this level and below. The owner invites their
 * contacts and sets what each can do; anyone else sees the people and can leave.
 */
@Component({
  selector: 'app-objective-share',
  imports: [PageHeaderComponent, ObjectiveIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-share.component.html',
  styleUrl: './objective-share.component.scss',
})
export class ObjectiveShareComponent {
  private readonly router = inject(Router);
  private readonly friends = inject(FriendsService);
  private readonly confirm = inject(ConfirmService);
  readonly store = inject(ObjectivesStore);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  readonly roleLabels = OBJECTIVE_ROLE_LABELS;
  /** The objective cannot be opened. */
  readonly missing = signal(false);
  readonly objective = computed(() => {
    const detail = this.store.detail();
    return detail?.id === this.id ? detail : null;
  });
  readonly isOwner = computed(() => this.objective()?.role === 'owner');
  readonly tint = computed(() => {
    const objective = this.objective();
    return objective ? objectiveTint(objective.category, this.store.settings().categoryColors) : '';
  });
  readonly members = computed(() =>
    (this.objective()?.members ?? []).map((member) => ({ ...member, avatar: toPerson(member) })),
  );

  /** Null until asked for, then while loading. */
  readonly contacts = signal<readonly Contact[] | null>(null);
  readonly inviteOpen = signal(false);
  readonly inviteUserId = signal('');
  readonly inviteRole = signal<ObjectiveMemberRole>('viewer');
  /** Contacts who cannot open it with that role yet. */
  readonly candidates = computed(() =>
    (this.contacts() ?? []).filter((contact) => {
      const member = this.objective()?.members.find(({ id }) => id === contact.id);
      return !member || (member.role === 'viewer' && member.inheritedFrom !== null);
    }),
  );
  readonly contactName = contactName;

  constructor() {
    if (this.store.detail()?.id !== this.id) void this.open();
  }

  async openInvite(): Promise<void> {
    this.inviteOpen.set(true);
    try {
      this.contacts.set(await firstValueFrom(this.friends.contacts()));
    } catch {
      this.contacts.set([]);
    }
    this.inviteUserId.set(this.candidates()[0]?.id ?? '');
  }

  async invite(): Promise<void> {
    if (!this.inviteUserId()) return;
    const invited = await this.store.addMember(this.id, { userId: this.inviteUserId(), role: this.inviteRole() });
    if (invited) this.inviteOpen.set(false);
  }

  updateRole(userId: string, role: ObjectiveMemberRole): void {
    void this.store.updateMemberRole(this.id, userId, role);
  }

  removeMember(userId: string): void {
    void this.store.removeMember(this.id, userId);
  }

  async leave(): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Quitter l’objectif ?',
      message: 'Vous n’y aurez plus accès, sauf si on vous y invite à nouveau.',
      confirmLabel: 'Quitter',
      tone: 'danger',
    });
    if (confirmed && (await this.store.leave(this.id))) void this.router.navigate(['/objectives']);
  }

  private async open(): Promise<void> {
    this.missing.set(!(await this.store.open(this.id)));
  }
}
