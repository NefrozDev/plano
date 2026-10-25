import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { BrowserStoragePlanoDataAdapter, PLANO_DATA_ADAPTER } from './plano-data.adapter';
import { PlanoDataStore } from './plano-data.store';

describe('PlanoDataStore', () => {
  const user = signal<AuthUser | null>(null);
  const signIn = (id: string) =>
    user.set({ id, firstName: '', lastName: '', username: id, email: `${id}@example.com` });
  const addTask = (store: PlanoDataStore, label: string) =>
    store.update((data) => ({
      ...data,
      dashboard: { tasks: [...data.dashboard.tasks, { id: label, label, done: false }] },
    }));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: PLANO_DATA_ADAPTER, useClass: BrowserStoragePlanoDataAdapter },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  it('switches to the signed-in account’s own data', () => {
    signIn('user-1');
    const store = TestBed.inject(PlanoDataStore);
    addTask(store, 'Tâche de user-1');
    expect(store.data().dashboard.tasks.map((task) => task.label)).toEqual(['Tâche de user-1']);

    signIn('user-2');
    expect(store.data().dashboard.tasks).toEqual([]);

    signIn('user-1');
    expect(store.data().dashboard.tasks.map((task) => task.label)).toEqual(['Tâche de user-1']);
  });
});
