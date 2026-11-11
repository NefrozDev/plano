import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { BottomNavComponent } from '../../shared/ui/bottom-nav.component';
import { FriendsPanelComponent } from './friends-panel.component';
import { SocialGroupsComponent } from './social-groups.component';

export type SocialTab = 'friends' | 'groups';

/**
 * `/social`, the fifth main tab: the people the user shares with. Friends
 * (requests, search, list) and groups each have their section; which one is
 * open lives in the URL (`?tab=groups`), so coming back from a group lands on it.
 */
@Component({
  selector: 'app-social',
  imports: [BottomNavComponent, FriendsPanelComponent, RouterLink, SocialGroupsComponent, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './social.component.html',
  styleUrl: './social.component.scss',
})
export class SocialComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationsStore);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly tabs: readonly { value: SocialTab; label: string; params: { tab?: SocialTab } }[] = [
    { value: 'friends', label: 'social.friends', params: {} },
    { value: 'groups', label: 'social.groups.heading', params: { tab: 'groups' } },
  ];
  readonly tab = computed<SocialTab>(() => (this.params().get('tab') === 'groups' ? 'groups' : 'friends'));
  /** Friend news not read yet: shown on the friends section while the groups one is open. */
  readonly friendNews = computed(() => this.notifications.unread().friends);
}
