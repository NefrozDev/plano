import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FriendNotificationsService } from './core/friends/friend-notifications.service';
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
  /** Created with the app, so friend events are heard on every screen. */
  readonly notifications = inject(FriendNotificationsService);
}
