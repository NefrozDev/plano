import { Routes } from '@angular/router';
import { authenticatedGuard, guestGuard, signedInGuard } from './core/auth/auth.guard';
import { MobileShellLayoutComponent } from './shared/ui/mobile-shell-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (component) => component.LoginComponent,
      ),
    title: 'titles.login',
  },
  {
    // The first screen after a first sign-in: Plano's own terms.
    path: 'welcome',
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('./features/auth/welcome/welcome.component').then(
        (component) => component.WelcomeComponent,
      ),
    title: 'titles.welcome',
  },
  // Accounts, passwords and their recovery moved to the Synapse account.
  { path: 'register', redirectTo: 'login' },
  { path: 'forgot-password', redirectTo: 'login' },
  { path: 'reset-password', redirectTo: 'login' },
  {
    path: 'terms',
    loadComponent: () =>
      import('./features/legal/terms-page.component').then(
        (component) => component.TermsPageComponent,
      ),
    title: 'titles.terms',
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
    title: 'titles.groups',
  },
  {
    path: 'groups/:groupId',
    canActivate: [authenticatedGuard],
    loadComponent: () =>
      import('./features/groups/group-detail/group-detail.component').then(
        (component) => component.GroupDetailComponent,
      ),
    title: 'titles.group',
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
        title: 'titles.home',
      },
      {
        path: 'lists',
        loadComponent: () =>
          import('./features/lists/lists.component').then(
            (component) => component.ListsComponent,
          ),
        title: 'titles.lists',
      },
      {
        path: 'lists/:listId',
        loadComponent: () =>
          import('./features/lists/list-detail/list-detail.component').then(
            (component) => component.ListDetailComponent,
          ),
        title: 'titles.list',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(
            (component) => component.SettingsComponent,
          ),
        title: 'titles.settings',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
