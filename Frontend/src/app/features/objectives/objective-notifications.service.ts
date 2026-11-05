import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { LiveEvent, ObjectiveNewsKind } from '@plano/common';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ObjectiveSettingsStore } from '../../core/settings/objective-settings.store';
import { LiveUpdatesService } from '../../core/live/live-updates.service';

type ObjectiveNews = Extract<LiveEvent, { type: 'objective.news' }>;

const MESSAGE_KEYS: Readonly<Record<ObjectiveNewsKind, string>> = {
  invited: 'notifications.objectiveInvited',
  contribution: 'notifications.objectiveContribution',
  completed: 'notifications.objectiveCompleted',
  comment: 'notifications.objectiveComment',
};

/**
 * Objective news while the app is open: a short message for the app-wide toast.
 * The "Notifications d'objectifs" setting turns it off, as it hides their
 * notifications (see NotificationsStore).
 */
@Injectable({ providedIn: 'root' })
export class ObjectiveNotificationsService {
  private readonly transloco = inject(TranslocoService);
  private readonly settings = inject(ObjectiveSettingsStore);
  private readonly auth = inject(AuthService);
  private readonly userId = computed(() => this.auth.user()?.id ?? null);

  /** Message of the last piece of news, until dismissed. */
  readonly message = signal('');

  constructor() {
    effect(() => {
      this.userId();
      untracked(() => this.reset());
    });
    inject(LiveUpdatesService)
      .events.pipe(
        filter((event): event is ObjectiveNews => event.type === 'objective.news'),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.receive(event));
  }

  dismiss(): void {
    this.message.set('');
  }

  private receive({ kind, title, actor }: ObjectiveNews): void {
    if (!this.settings.settings().notifications) return;
    this.message.set(this.transloco.translate(MESSAGE_KEYS[kind], { name: actor, title }));
  }

  private reset(): void {
    this.message.set('');
  }
}
