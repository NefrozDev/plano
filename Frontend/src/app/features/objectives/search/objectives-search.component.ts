import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Objective, ObjectiveCategory } from '@plano/common';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { formatDate } from '../../../core/time/dates';
import { objectiveTint } from '../objective.utils';
import { DEFAULT_OBJECTIVE_FILTERS, ObjectivesStore } from '../objectives.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ObjectiveIconComponent } from '../ui/objective-icon.component';

@Component({
  selector: 'app-objectives-search',
  imports: [RouterLink, PageHeaderComponent, SearchFieldComponent, ObjectiveIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objectives-search.component.html',
  styleUrl: './objectives-search.component.scss',
})
export class ObjectivesSearchComponent {
  private readonly router = inject(Router);
  private readonly store = inject(ObjectivesStore);

  readonly query = signal('');
  readonly results = computed(() => this.store.search(this.query()));
  readonly recent = this.store.recent;
  readonly suggestions: readonly { category: ObjectiveCategory; label: string }[] = [
    { category: 'health', label: 'Objectifs santé' },
    { category: 'learning', label: 'Objectifs d’apprentissage' },
    { category: 'finance', label: 'Objectifs financiers' },
    { category: 'development', label: 'Développement personnel' },
  ];

  tint(objective: Objective): string {
    return objectiveTint(objective.category, this.store.settings().categoryColors);
  }

  caption(objective: Objective): string {
    return objective.dueDate ? `Échéance : ${formatDate(objective.dueDate)}` : 'Sans échéance';
  }

  /** A suggestion is a shortcut to the overview filtered on one category. */
  applySuggestion(category: ObjectiveCategory): void {
    this.store.filters.set({ ...DEFAULT_OBJECTIVE_FILTERS, categories: [category] });
    void this.router.navigateByUrl('/objectives');
  }
}
