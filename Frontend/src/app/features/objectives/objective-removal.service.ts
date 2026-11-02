import { Injectable, inject } from '@angular/core';
import type { ObjectiveDetail, ObjectiveSummary } from '@plano/common';
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
    if (!below) return `« ${title} » sera supprimé définitivement.`;
    return `« ${title} » et ${below > 1 ? `ses ${below} sous-objectifs seront supprimés` : 'son sous-objectif seront supprimés'} définitivement.`;
  }

  /** `message` says what goes; resolves true once deleted. */
  async remove(objective: Pick<ObjectiveSummary, 'id' | 'title' | 'linkedListCount'>, message: string): Promise<boolean> {
    const confirmed = await this.confirm.ask({
      heading: 'Supprimer l’objectif ?',
      message,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!confirmed) return false;
    const count = objective.linkedListCount;
    const deleteLists =
      count > 0 &&
      (await this.confirm.ask({
        heading: count > 1 ? 'Supprimer aussi ses listes ?' : 'Supprimer aussi sa liste ?',
        message:
          count > 1
            ? `${count} listes sont liées à « ${objective.title} ». Sinon, elles restent dans vos listes.`
            : `Une liste est liée à « ${objective.title} ». Sinon, elle reste dans vos listes.`,
        confirmLabel: count > 1 ? 'Supprimer les listes' : 'Supprimer la liste',
        cancelLabel: count > 1 ? 'Garder les listes' : 'Garder la liste',
        tone: 'danger',
      }));
    return this.store.remove(objective.id, deleteLists);
  }
}
