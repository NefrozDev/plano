import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ClipboardService } from '../../../core/browser/clipboard.service';
import { objectiveTint } from '../objective.utils';
import { ObjectivesStore } from '../objectives.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ObjectiveIconComponent } from '../ui/objective-icon.component';

@Component({
  selector: 'app-objective-share',
  standalone: true,
  imports: [PageHeaderComponent, ObjectiveIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-share.component.html',
  styleUrl: './objective-share.component.scss',
})
export class ObjectiveShareComponent {
  private readonly router = inject(Router);
  private readonly clipboard = inject(ClipboardService);
  private readonly store = inject(ObjectivesStore);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  readonly objective = computed(() => this.store.find(this.id));
  readonly isOwner = computed(() => this.objective()?.ownerId === this.store.currentUserId());
  readonly owner = computed(() => this.store.contact(this.objective()?.ownerId ?? ''));
  readonly tint = computed(() => {
    const objective = this.objective();
    return objective ? objectiveTint(objective.category, this.store.settings().categoryColors) : '';
  });
  /** People who can be invited: everyone but the owner (who always has access). */
  readonly candidates = computed(() =>
    this.store.contacts().filter((contact) => contact.id !== this.objective()?.ownerId),
  );
  readonly selected = signal<readonly string[]>(this.objective()?.sharedWith ?? []);
  readonly inviteOpen = signal(false);
  readonly copied = signal(false);
  readonly copyFailed = signal(false);
  readonly shareLink = computed(() => `plano.app/objectif/${this.objective()?.shareCode ?? ''}`);

  isSelected(contactId: string): boolean {
    return this.selected().includes(contactId);
  }

  toggle(contactId: string): void {
    if (!this.isOwner()) return;
    this.selected.update((selected) =>
      selected.includes(contactId)
        ? selected.filter((id) => id !== contactId)
        : [...selected, contactId],
    );
  }

  invite(name: string): void {
    const contact = this.store.addContact(name);
    if (contact) this.selected.update((selected) => [...selected, contact.id]);
    this.inviteOpen.set(false);
  }

  async copyLink(): Promise<void> {
    // When the clipboard is refused, the template lets the user copy the link by hand.
    const copied = await this.clipboard.copy(`https://${this.shareLink()}`);
    this.copied.set(copied);
    this.copyFailed.set(!copied);
  }

  share(): void {
    if (!this.isOwner()) return;
    this.store.share(this.id, this.selected());
    void this.router.navigate(['/objectives', this.id]);
  }
}
