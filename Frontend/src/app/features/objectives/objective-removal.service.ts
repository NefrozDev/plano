import { Injectable, inject } from '@angular/core';
import type { ObjectiveDetail, ObjectiveSummary } from '@plano/common';
import { t, tCount } from '../../core/i18n/translate';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { ObjectivesStore } from './objectives.store';

/**
 * Deleting an objective, the same way from every screen: confirmed first, then,
 * when lists are linked to it or below, whether they go too. Keeping them is
 * the default, also when that second question is dismissed.
 */
@Injectable({ providedIn: 'root' })
export class ObjectiveRemovalService {
  private readonly confirm = inject(ConfirmService);
  private readonly store = inject(ObjectivesStore);

  /** What goes with an open objective: its sub-objectives too. */
  messageFor({ title, descendantCount: below }: Pick<ObjectiveDetail, 'title' | 'descendantCount'>): string {
    if (!below) return t('objectives.removal.alone', { title });
    return tCount('objectives.removal.withChildren', below, { title });
  }

  /** `message` says what goes; resolves true once deleted. */
  async remove(objective: Pick<ObjectiveSummary, 'id' | 'title' | 'linkedListCount'>, message: string): Promise<boolean> {
    const confirmed = await this.confirm.ask({
      heading: t('objectives.removal.heading'),
      message,
      confirmLabel: t('objectives.removal.delete'),
      tone: 'danger',
    });
    if (!confirmed) return false;
    const count = objective.linkedListCount;
    const deleteLists =
      count > 0 &&
      (await this.confirm.ask({
        heading: tCount('objectives.removal.listsHeading', count),
        message: tCount('objectives.removal.lists', count, { title: objective.title }),
        confirmLabel: tCount('objectives.removal.deleteLists', count),
        cancelLabel: tCount('objectives.removal.keepLists', count),
        tone: 'danger',
      }));
    return this.store.remove(objective.id, deleteLists);
  }
}
