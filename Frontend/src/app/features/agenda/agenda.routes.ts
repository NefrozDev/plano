import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { MobileShellLayoutComponent } from '../../shared/ui/mobile-shell-layout.component';
import { AgendaStore } from './agenda.store';

export const AGENDA_ROUTES: Routes = [
  {
    path: '',
    component: MobileShellLayoutComponent,
    // Screens read events at once (an edit form fills itself from its event): load them first.
    resolve: { events: () => inject(AgendaStore).enter() },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./calendar/agenda-calendar.component').then((m) => m.AgendaCalendarComponent),
        title: 'titles.agenda',
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./event-form/agenda-event-form.component').then((m) => m.AgendaEventFormComponent),
        title: 'titles.newEvent',
      },
      {
        path: 'events/:id/edit',
        loadComponent: () =>
          import('./event-form/agenda-event-form.component').then((m) => m.AgendaEventFormComponent),
        title: 'titles.editEvent',
      },
      {
        path: 'events/:id',
        loadComponent: () =>
          import('./event-detail/agenda-event-detail.component').then((m) => m.AgendaEventDetailComponent),
        title: 'titles.event',
      },
      {
        path: 'filters',
        loadComponent: () =>
          import('./filters/agenda-filters.component').then((m) => m.AgendaFiltersComponent),
        title: 'titles.agendaFilters',
      },
      {
        path: 'search',
        loadComponent: () =>
          import('./search/agenda-search.component').then((m) => m.AgendaSearchComponent),
        title: 'titles.agendaSearch',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/agenda-settings.component').then((m) => m.AgendaSettingsComponent),
        title: 'titles.agendaSettings',
      },
    ],
  },
];
