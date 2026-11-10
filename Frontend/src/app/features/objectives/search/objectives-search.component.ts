import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ObjectiveCategory, ObjectiveSummary } from '@plano/common';
import { SearchFieldComponent } from '../../../shared/ui/search-field.component';
import { dueCaption, objectiveTint } from '../objective.utils';
import { DEFAULT_OBJECTIVE_FILTERS, ObjectivesStore } from '../objectives.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ObjectiveIconComponent } from '../ui/objective-icon.component';

@Component({
  selector: 'app-objectives-search',
  imports: [RouterLink, TranslocoPipe, PageHeaderComponent, SearchFieldComponent, ObjectiveIconComponent],
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
    { category: 'health', label: 'objectives.search.health' },
    { category: 'learning', label: 'objectives.search.learning' },
    { category: 'finance', label: 'objectives.search.finance' },
    { category: 'development', label: 'objectives.search.development' },
  ];

  tint(objective: ObjectiveSummary): string {
    return objectiveTint(objective.category, this.store.settings().categoryColors);
  }

  caption(objective: ObjectiveSummary): string {
    return dueCaption(objective);
  }

  constructor() {
    void this.store.load();
  }

  /** A suggestion is a shortcut to the overview filtered on one category. */
  applySuggestion(category: ObjectiveCategory): void {
    this.store.filters.set({ ...DEFAULT_OBJECTIVE_FILTERS, categories: [category] });
    void this.router.navigateByUrl('/objectives');
  }
}
