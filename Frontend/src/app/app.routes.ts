import { Routes } from '@angular/router';
import { authenticatedGuard, guestGuard } from './core/auth/auth.guard';

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
  {
    path: 'group/setup',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./features/groups/group-setup/group-setup.component').then(
        (component) => component.GroupSetupComponent,
      ),
    title: 'Mon groupe | Plano',
  },
  {
    path: 'lists',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./features/lists/lists.component').then(
        (component) => component.ListsComponent,
      ),
    title: 'Listes | Plano',
  },
  {
    path: 'lists/:slug',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./features/lists/list-detail/list-detail.component').then(
        (component) => component.ListDetailComponent,
      ),
    title: 'Détail de la liste | Plano',
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
    path: '',
    pathMatch: 'full',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (component) => component.DashboardComponent,
      ),
    title: 'Plano',
  },
  { path: '**', redirectTo: '' },
];
