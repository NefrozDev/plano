import { Type, reflectComponentType } from '@angular/core';
import { Route, Routes } from '@angular/router';
import { routes } from './app.routes';
import { authenticatedGuard, guestGuard } from './core/auth/auth.guard';
import { MobileShellLayoutComponent } from './shared/ui/mobile-shell-layout.component';

/** Resolves a lazy loader the way the router does: a default export or the value itself. */
async function load<T>(loader: () => unknown): Promise<T> {
  const loaded = (await loader()) as T | { default: T };
  return loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : (loaded as T);
}

/** Every route of the tree, lazy children included, with its full path. */
async function flatten(tree: Routes, parent = ''): Promise<{ path: string; route: Route }[]> {
  const flat: { path: string; route: Route }[] = [];
  for (const route of tree) {
    const path = [parent, route.path].filter(Boolean).join('/');
    flat.push({ path, route });
    const children = route.loadChildren
      ? await load<Routes>(route.loadChildren as () => unknown)
      : route.children;
    if (children) flat.push(...(await flatten(children, path)));
  }
  return flat;
}

describe('app routes', () => {
  it('lazy-loads a real component for every routed screen', async () => {
    const lazy = (await flatten(routes)).filter(({ route }) => route.loadComponent);

    // Login, register, group setup, dashboard, lists and the agenda/objectives screens.
    expect(lazy.length).toBeGreaterThan(10);
    for (const { path, route } of lazy) {
      const component = await load<Type<unknown>>(route.loadComponent as () => unknown);
      expect(reflectComponentType(component), `/${path}`).not.toBeNull();
    }
  });

  it('keeps login and register for guests and every other screen for signed-in users', () => {
    const guardsOf = (path: string) => routes.find((route) => route.path === path)?.canActivate;

    expect(guardsOf('login')).toEqual([guestGuard]);
    expect(guardsOf('register')).toEqual([guestGuard]);
    for (const path of ['groups', 'groups/:groupId', 'agenda', 'objectives']) {
      expect(guardsOf(path), path).toEqual([authenticatedGuard]);
    }
    // The former single-group page now lands on the groups overview.
    expect(routes.find((route) => route.path === 'group/setup')?.redirectTo).toBe('groups');
  });

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
