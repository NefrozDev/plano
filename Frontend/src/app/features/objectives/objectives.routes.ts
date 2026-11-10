import { Routes } from '@angular/router';
import { MobileShellLayoutComponent } from '../../shared/ui/mobile-shell-layout.component';

export const OBJECTIVES_ROUTES: Routes = [
  {
    path: '',
    component: MobileShellLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./overview/objectives-overview.component').then((m) => m.ObjectivesOverviewComponent),
        title: 'titles.objectives',
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./form/objective-form.component').then((m) => m.ObjectiveFormComponent),
        title: 'titles.newObjective',
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./search/objectives-search.component').then((m) => m.ObjectivesSearchComponent),
        title: 'titles.objectiveSearch',
      },
      {
        path: 'filters',
        loadComponent: () =>
          import('./filters/objectives-filters.component').then((m) => m.ObjectivesFiltersComponent),
        title: 'titles.objectiveFilters',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/objectives-settings.component').then((m) => m.ObjectivesSettingsComponent),
        title: 'titles.objectiveSettings',
      },
      {
        path: ':id/share',
        loadComponent: () =>
          import('./share/objective-share.component').then((m) => m.ObjectiveShareComponent),
        title: 'titles.shareObjective',
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./form/objective-form.component').then((m) => m.ObjectiveFormComponent),
        title: 'titles.editObjective',
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./detail/objective-detail-layout.component').then((m) => m.ObjectiveDetailLayoutComponent),
        title: 'titles.objective',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./detail/summary/objective-summary.component').then((m) => m.ObjectiveSummaryComponent),
          },
          {
            path: 'calendar',
            loadComponent: () =>
              import('./detail/calendar/objective-calendar.component').then((m) => m.ObjectiveCalendarComponent),
          },
          {
            path: 'stats',
            loadComponent: () =>
              import('./detail/stats/objective-stats.component').then((m) => m.ObjectiveStatsComponent),
          },
          {
            path: 'activity',
            loadComponent: () =>
              import('./detail/activity/objective-activity.component').then((m) => m.ObjectiveActivityComponent),
          },
          {
            path: 'habit',
            loadComponent: () =>
              import('./detail/habit/objective-habit.component').then((m) => m.ObjectiveHabitComponent),
          },
        ],
      },
    ],
  },
];
