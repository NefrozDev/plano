import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FriendNotificationsService } from './core/friends/friend-notifications.service';
import { ObjectiveNotificationsService } from './features/objectives/objective-notifications.service';
import { ConfirmHostComponent } from './shared/ui/confirm-host.component';
import { SplashScreenComponent } from './shared/ui/splash-screen.component';
import { ToastComponent } from './shared/ui/toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmHostComponent, SplashScreenComponent, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  /** Created with the app, so their events are heard on every screen. */
  readonly notifications = inject(FriendNotificationsService);
  readonly objectiveNews = inject(ObjectiveNotificationsService);
  readonly toast = computed(() => this.notifications.message() || this.objectiveNews.message());
  /** Shown once per launch, over the screen loading underneath. */
  readonly splash = signal(true);

  dismissToast(): void {
    this.notifications.dismiss();
    this.objectiveNews.dismiss();
  }
}
