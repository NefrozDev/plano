import { routes } from './app.routes';
import { authenticatedGuard } from './core/auth/auth.guard';
import { MobileShellLayoutComponent } from './shared/ui/mobile-shell-layout.component';

describe('app routes', () => {
  it('renders the dashboard and lists inside the shared, guarded phone shell', () => {
    const shell = routes.find((route) => route.component === MobileShellLayoutComponent);

    expect(shell?.canActivate).toEqual([authenticatedGuard]);
    expect(shell?.children?.map((child) => child.path)).toEqual(['', 'lists', 'lists/:listId']);
  });

  it('keeps the catch-all redirect last so the shell does not swallow feature routes', () => {
    expect(routes[routes.length - 1]).toEqual({ path: '**', redirectTo: '' });
    expect(routes.findIndex((route) => route.path === 'agenda')).toBeLessThan(
      routes.findIndex((route) => route.component === MobileShellLayoutComponent),
    );
  });
});
