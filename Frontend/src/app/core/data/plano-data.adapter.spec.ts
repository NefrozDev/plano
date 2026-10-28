import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { createMockPlanoData, type PlanoData } from '@plano/common';
import type { AuthUser } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import {
  BrowserStoragePlanoDataAdapter,
  MemoryPlanoDataAdapter,
  initialPlanoData,
} from './plano-data.adapter';

describe('Plano data adapters', () => {
  const user = signal<AuthUser | null>(null);
  const signIn = (id: string) =>
    user.set({ id, firstName: '', lastName: '', username: id, email: `${id}@example.com`, locale: 'fr', avatarVersion: null });
  let adapter: BrowserStoragePlanoDataAdapter;

  beforeEach(() => {
    localStorage.clear();
    signIn('user-1');
    TestBed.configureTestingModule({
      providers: [BrowserStoragePlanoDataAdapter, { provide: AuthService, useValue: { user } }],
    });
    adapter = TestBed.inject(BrowserStoragePlanoDataAdapter);
  });

  it('keeps independent copies in memory', () => {
    const memory = new MemoryPlanoDataAdapter();
    const data = createMockPlanoData();
    memory.save(data);

    data.dashboard.tasks[0].label = 'Changed outside the adapter';

    expect(memory.load()?.dashboard.tasks[0].label).not.toBe('Changed outside the adapter');
  });

  it('starts a new account with no content', () => {
    const data = initialPlanoData(adapter);

    expect(data.dashboard.tasks).toEqual([]);
    expect(data.objectives.items).toEqual([]);
    expect(data.objectives.contacts.map((contact) => contact.id)).toEqual(['me']);
    expect(data.agenda.events).toEqual([]);
    expect(data.agenda.contacts).toEqual([]);
    expect(data.agenda.calendars.length).toBeGreaterThan(0);
  });

  it('round-trips versioned data through browser storage', () => {
    const data = createMockPlanoData();
    data.dashboard.tasks[0].done = true;

    adapter.save(data);

    expect(adapter.load()?.dashboard.tasks[0].done).toBe(true);
  });

  it('keeps each account’s data separate', () => {
    adapter.save(createMockPlanoData());

    signIn('user-2');
    expect(adapter.load()).toBeNull();

    signIn('user-1');
    expect(adapter.load()?.objectives.items.length).toBeGreaterThan(0);
  });

  it('neither reads nor writes while signed out', () => {
    adapter.save(createMockPlanoData());
    user.set(null);

    expect(adapter.load()).toBeNull();
    adapter.save(createMockPlanoData());
    expect(Object.keys(localStorage)).toEqual(['plano:data:v1:user-1']);
  });

  it('ignores data stored before it was kept per account', () => {
    localStorage.setItem('plano:data:v1', JSON.stringify(createMockPlanoData()));

    expect(adapter.load()).toBeNull();
  });

  it('backfills empty objectives and agenda into data saved before they existed', () => {
    const legacy: Partial<PlanoData> = createMockPlanoData();
    legacy.dashboard!.tasks[0].label = 'Tâche gardée';
    delete legacy.objectives;
    delete legacy.agenda;
    localStorage.setItem('plano:data:v1:user-1', JSON.stringify(legacy));

    const loaded = adapter.load();

    expect(loaded?.dashboard.tasks[0].label).toBe('Tâche gardée');
    expect(loaded?.objectives.items).toEqual([]);
    expect(loaded?.agenda.events).toEqual([]);
  });

  it('drops data no longer kept in storage: lists and the week strip', () => {
    const stored = { ...createMockPlanoData(), lists: [], listDetails: {} };
    localStorage.setItem(
      'plano:data:v1:user-1',
      JSON.stringify({ ...stored, dashboard: { ...stored.dashboard, weekDays: [] } }),
    );

    const loaded = adapter.load();

    expect(Object.keys(loaded ?? {})).toEqual(['version', 'dashboard', 'objectives', 'agenda']);
    expect(Object.keys(loaded?.dashboard ?? {})).toEqual(['tasks']);
  });

  it('ignores malformed or unsupported stored data', () => {
    localStorage.setItem('plano:data:v1:user-1', '{broken');
    expect(adapter.load()).toBeNull();

    localStorage.setItem('plano:data:v1:user-1', JSON.stringify({ version: 2, lists: [] }));
    expect(adapter.load()).toBeNull();
  });
});
