import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ObjectiveCategory, ObjectiveStatus } from '@plano/common';
import { OBJECTIVE_CATEGORIES, STATUS_LABELS } from '../objective.utils';
import { ObjectiveFilters, ObjectivesStore } from '../objectives.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ObjectiveIconComponent } from '../ui/objective-icon.component';

@Component({
  selector: 'app-objectives-filters',
  imports: [RouterLink, PageHeaderComponent, ObjectiveIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objectives-filters.component.html',
  styleUrl: './objectives-filters.component.scss',
})
export class ObjectivesFiltersComponent {
  readonly store = inject(ObjectivesStore);

  readonly statuses = Object.entries(STATUS_LABELS) as [ObjectiveStatus, string][];
  readonly categories = OBJECTIVE_CATEGORIES;
  readonly filters = this.store.filters;
  readonly resultCount = computed(() => this.store.query('all').length);

  toggleStatus(status: ObjectiveStatus): void {
    this.filters.update((filters) => ({ ...filters, statuses: toggled(filters.statuses, status) }));
  }

  toggleCategory(category: ObjectiveCategory): void {
    this.filters.update((filters) => ({ ...filters, categories: toggled(filters.categories, category) }));
  }

  /** "Tous" / "Toutes" means no restriction, so it can be selected but never unticked. */
  clear(key: 'statuses' | 'categories', event: Event): void {
    (event.target as HTMLInputElement).checked = true;
    this.filters.update((filters) => ({ ...filters, [key]: [] }));
  }

  setSort(changes: Partial<Pick<ObjectiveFilters, 'sort' | 'direction'>>): void {
    this.filters.update((filters) => ({ ...filters, ...changes }));
  }
}

function toggled<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
