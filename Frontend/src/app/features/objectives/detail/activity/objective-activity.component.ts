import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import type { ObjectiveActivityEntry, ObjectiveCommentEntry } from '@plano/common';
import { firstValueFrom } from 'rxjs';
import { httpErrorMessage } from '../../../../core/http/http-error-message';
import { formatDate, toIsoDate, toTimeOfDay } from '../../../../core/time/dates';
import { activityLabel } from '../../objective.utils';
import { ObjectivesApiService } from '../../objectives-api.service';
import { ObjectivesStore } from '../../objectives.store';
import { ObjectiveContext } from '../objective-context';

const FAILURE_MESSAGE = 'L’action a échoué. Veuillez réessayer.';

/** What people say about an objective, and what happened on it. */
@Component({
  selector: 'app-objective-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-activity.component.html',
  styleUrl: './objective-activity.component.scss',
})
export class ObjectiveActivityComponent {
  private readonly api = inject(ObjectivesApiService);
  private readonly store = inject(ObjectivesStore);

  readonly objective = inject(ObjectiveContext).objective;
  readonly comments = signal<readonly ObjectiveCommentEntry[]>([]);
  readonly history = signal<readonly ObjectiveActivityEntry[]>([]);
  readonly error = signal('');
  readonly sending = signal(false);
  readonly lines = computed(() =>
    this.history().map((entry) => ({
      id: entry.id,
      who: entry.actor?.name ?? 'Plano',
      what: activityLabel(entry),
      // Lines from below say what they were on.
      on: entry.objectiveId === this.objective()?.id ? '' : entry.objectiveTitle,
      when: this.when(entry.createdAt),
    })),
  );

  constructor() {
    // The objective is reloaded with each live change: this follows it.
    effect(() => {
      const id = this.objective()?.id;
      if (id) untracked(() => void this.load(id));
    });
  }

  when(timestamp: string): string {
    const date = new Date(timestamp);
    return `${formatDate(toIsoDate(date))} à ${toTimeOfDay(date)}`;
  }

  /** People take back what they said; the owner can remove anything. */
  canRemove(comment: ObjectiveCommentEntry): boolean {
    return this.objective()?.role === 'owner' || comment.author?.id === this.store.currentUserId();
  }

  async send(input: HTMLTextAreaElement): Promise<void> {
    const id = this.objective()?.id;
    const body = input.value.trim();
    if (!id || !body || this.sending()) return;
    this.sending.set(true);
    await this.attempt(async () => {
      const comment = await firstValueFrom(this.api.addComment(id, { body }));
      this.comments.update((comments) => [...comments, comment]);
      input.value = '';
    });
    this.sending.set(false);
  }

  async remove(commentId: string): Promise<void> {
    const id = this.objective()?.id;
    if (!id) return;
    await this.attempt(async () => {
      await firstValueFrom(this.api.removeComment(id, commentId));
      this.comments.update((comments) => comments.filter((comment) => comment.id !== commentId));
    });
  }

  private async load(id: string): Promise<void> {
    await this.attempt(async () => {
      const [comments, history] = await Promise.all([
        firstValueFrom(this.api.findComments(id)),
        firstValueFrom(this.api.findActivity(id)),
      ]);
      // Another objective may have been opened in the meantime.
      if (this.objective()?.id !== id) return;
      this.comments.set(comments);
      this.history.set(history);
    });
  }

  private async attempt(action: () => Promise<void>): Promise<void> {
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(httpErrorMessage(error, { fallback: FAILURE_MESSAGE, useServerCode: true }));
    }
  }
}
