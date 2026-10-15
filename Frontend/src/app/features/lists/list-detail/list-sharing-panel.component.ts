import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { ShareRole } from '@plano/common';
import { ClipboardService } from '../../../core/browser/clipboard.service';
import { InvitedRole, ListsStore } from '../lists.store';
import { ROLE_LABELS } from './list-options';

/** Members, roles and invitation link of one list, edited straight in the store. */
@Component({
  selector: 'app-list-sharing-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-sharing-panel.component.html',
  styles: `:host { display: contents; }`,
})
export class ListSharingPanelComponent {
  private readonly store = inject(ListsStore);
  private readonly clipboard = inject(ClipboardService);

  readonly slug = input.required<string>();
  readonly listTitle = input.required<string>();
  readonly color = input.required<string>();
  readonly close = output<void>();

  readonly roleLabels = ROLE_LABELS;
  private readonly detail = computed(() => this.store.detail(this.slug()));
  readonly members = computed(() => this.detail()?.members ?? []);
  readonly sharingEnabled = computed(() => this.detail()?.sharingEnabled ?? false);
  readonly invitationLink = computed(() => `plano.app/l/${this.slug()}-a1b2c3`);

  readonly inviteFormOpen = signal(false);
  readonly inviteEmail = signal('');
  readonly inviteRole = signal<InvitedRole>('editor');
  readonly linkCopied = signal(false);

  invite(): void {
    if (!this.inviteEmail().trim()) return;
    this.store.inviteMember(this.slug(), this.inviteEmail(), this.inviteRole());
    this.inviteEmail.set('');
    this.inviteFormOpen.set(false);
  }

  updateRole(memberId: string, role: ShareRole): void {
    this.store.updateMemberRole(this.slug(), memberId, role);
  }

  setSharing(enabled: boolean): void {
    this.store.setSharing(this.slug(), enabled);
    this.inviteFormOpen.set(false);
  }

  async copyInvitationLink(): Promise<void> {
    this.linkCopied.set(await this.clipboard.copy(`https://${this.invitationLink()}`));
  }
}
