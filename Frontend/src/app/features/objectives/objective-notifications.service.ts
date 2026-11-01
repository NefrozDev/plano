import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { LiveEvent, ObjectiveNewsKind } from '@plano/common';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PlanoDataStore } from '../../core/data/plano-data.store';
import { LiveUpdatesService } from '../../core/live/live-updates.service';

type ObjectiveNews = Extract<LiveEvent, { type: 'objective.news' }>;

const MESSAGE_KEYS: Readonly<Record<ObjectiveNewsKind, string>> = {
  invited: 'notifications.objectiveInvited',
  contribution: 'notifications.objectiveContribution',
  completed: 'notifications.objectiveCompleted',
};

/**
 * What is new on the objectives side while the app is open: a short message for
 * the app-wide toast and a badge on the tab, until the objectives are opened.
 * The "Notifications d'objectifs" setting turns both off.
 */
@Injectable({ providedIn: 'root' })
export class ObjectiveNotificationsService {
  private readonly transloco = inject(TranslocoService);
  private readonly appData = inject(PlanoDataStore);
  private readonly auth = inject(AuthService);
  private readonly userId = computed(() => this.auth.user()?.id ?? null);

  /** News not seen yet, shown as a badge on the objectives tab. */
  readonly unseen = signal(0);
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

  /** The objectives are on screen. */
  markSeen(): void {
    this.unseen.set(0);
  }

  dismiss(): void {
    this.message.set('');
  }

  private receive({ kind, title, actor }: ObjectiveNews): void {
    if (!this.appData.data().objectives.settings.notifications) return;
    this.unseen.update((count) => count + 1);
    this.message.set(this.transloco.translate(MESSAGE_KEYS[kind], { name: actor, title }));
  }

  private reset(): void {
    this.unseen.set(0);
    this.message.set('');
  }
}
