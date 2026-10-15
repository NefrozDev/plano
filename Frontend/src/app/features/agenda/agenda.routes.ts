import { Routes } from '@angular/router';
import { MobileShellLayoutComponent } from '../../shared/ui/mobile-shell-layout.component';

export const AGENDA_ROUTES: Routes = [
  {
    path: '',
    component: MobileShellLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./calendar/agenda-calendar.component').then((m) => m.AgendaCalendarComponent),
        title: 'Agenda | Plano',
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./event-form/agenda-event-form.component').then((m) => m.AgendaEventFormComponent),
        title: 'Nouvel événement | Plano',
      },
      {
        path: 'events/:id/edit',
        loadComponent: () =>
          import('./event-form/agenda-event-form.component').then((m) => m.AgendaEventFormComponent),
        title: 'Modifier l’événement | Plano',
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./event-detail/agenda-event-detail.component').then((m) => m.AgendaEventDetailComponent),
        title: 'Événement | Plano',
      },
      {
        path: 'filters',
        loadComponent: () =>
          import('./filters/agenda-filters.component').then((m) => m.AgendaFiltersComponent),
        title: 'Filtres de l’agenda | Plano',
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./search/agenda-search.component').then((m) => m.AgendaSearchComponent),
        title: 'Rechercher dans l’agenda | Plano',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/agenda-settings.component').then((m) => m.AgendaSettingsComponent),
        title: 'Paramètres de l’agenda | Plano',
      },
    ],
  },
];
