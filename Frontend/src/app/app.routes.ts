import { Routes } from '@angular/router';
import { authenticatedGuard, guestGuard } from './core/auth/auth.guard';
import { MobileShellLayoutComponent } from './shared/ui/mobile-shell-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (component) => component.LoginComponent,
      ),
    title: 'Connexion | Plano',
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register.component').then(
        (component) => component.RegisterComponent,
      ),
    title: 'Créer un compte | Plano',
  },
  // Former single-group page, still reached from older links.
  { path: 'group/setup', redirectTo: 'groups' },
  {
    path: 'groups',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./features/groups/groups-overview/groups-overview.component').then(
        (component) => component.GroupsOverviewComponent,
      ),
    title: 'Mes groupes | Plano',
  },
  {
    path: 'groups/:groupId',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./features/groups/group-detail/group-detail.component').then(
        (component) => component.GroupDetailComponent,
      ),
    title: 'Groupe | Plano',
  },
  {
    path: 'agenda',
    canActivate: [authenticatedGuard],
    loadChildren: () =>
      import('./features/agenda/agenda.routes').then(
        (routes) => routes.AGENDA_ROUTES,
      ),
  },
  {
    path: 'objectives',
    canActivate: [authenticatedGuard],
    loadChildren: () =>
      import('./features/objectives/objectives.routes').then(
        (routes) => routes.OBJECTIVES_ROUTES,
      ),
  },
  {
    // Top-level screens without their own route file share the phone-frame shell.
    path: '',
    component: MobileShellLayoutComponent,
    canActivate: [authenticatedGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (component) => component.DashboardComponent,
          ),
        title: 'Plano',
      },
      {
        path: 'lists',
        loadComponent: () =>
          import('./features/lists/lists.component').then(
            (component) => component.ListsComponent,
          ),
        title: 'Listes | Plano',
      },
      {
        path: 'lists/:listId',
        loadComponent: () =>
          import('./features/lists/list-detail/list-detail.component').then(
            (component) => component.ListDetailComponent,
          ),
        title: 'Détail de la liste | Plano',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
