import { Routes } from '@angular/router';
import { ObjectivesLayoutComponent } from './objectives-layout.component';

export const OBJECTIVES_ROUTES: Routes = [
  {
    path: '',
    component: ObjectivesLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./overview/objectives-overview.component').then((m) => m.ObjectivesOverviewComponent),
        title: 'Objectifs | Plano',
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./create/objective-create.component').then((m) => m.ObjectiveCreateComponent),
        title: 'Nouvel objectif | Plano',
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./search/objectives-search.component').then((m) => m.ObjectivesSearchComponent),
        title: 'Rechercher un objectif | Plano',
      },
      {
        path: 'filters',
        loadComponent: () =>
          import('./filters/objectives-filters.component').then((m) => m.ObjectivesFiltersComponent),
        title: 'Filtres des objectifs | Plano',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/objectives-settings.component').then((m) => m.ObjectivesSettingsComponent),
        title: 'Paramètres des objectifs | Plano',
      },
      {
        path: ':id/share',
        loadComponent: () =>
          import('./share/objective-share.component').then((m) => m.ObjectiveShareComponent),
        title: 'Partager un objectif | Plano',
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./detail/objective-detail-layout.component').then((m) => m.ObjectiveDetailLayoutComponent),
        title: 'Objectif | Plano',
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
            path: 'steps',
            loadComponent: () =>
              import('./detail/steps/objective-steps.component').then((m) => m.ObjectiveStepsComponent),
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
