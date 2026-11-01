import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FriendNotificationsService } from './core/friends/friend-notifications.service';
import { ObjectiveNotificationsService } from './features/objectives/objective-notifications.service';
import { ConfirmHostComponent } from './shared/ui/confirm-host.component';
import { ToastComponent } from './shared/ui/toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmHostComponent, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  /** Created with the app, so their events are heard on every screen. */
  readonly notifications = inject(FriendNotificationsService);
  readonly objectiveNews = inject(ObjectiveNotificationsService);
  readonly toast = computed(() => this.notifications.message() || this.objectiveNews.message());

  dismissToast(): void {
    this.notifications.dismiss();
    this.objectiveNews.dismiss();
  }
}
