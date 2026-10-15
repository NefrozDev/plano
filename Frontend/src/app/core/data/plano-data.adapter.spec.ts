import { createMockPlanoData, type PlanoData } from '@plano/common';
import {
  BrowserStoragePlanoDataAdapter,
  MemoryPlanoDataAdapter,
} from './plano-data.adapter';

describe('Plano data adapters', () => {
  beforeEach(() => localStorage.clear());

  it('keeps independent copies in memory', () => {
    const adapter = new MemoryPlanoDataAdapter();
    const data = createMockPlanoData();
    adapter.save(data);

    data.dashboard.tasks[0].label = 'Changed outside the adapter';

    expect(adapter.load()?.dashboard.tasks[0].label).not.toBe('Changed outside the adapter');
  });

  it('round-trips versioned data through browser storage', () => {
    const adapter = new BrowserStoragePlanoDataAdapter();
    const data = createMockPlanoData();
    data.dashboard.tasks[0].done = true;

    adapter.save(data);

    expect(adapter.load()?.dashboard.tasks[0].done).toBeTrue();
  });

  it('backfills objectives and agenda into data saved before they existed', () => {
    const adapter = new BrowserStoragePlanoDataAdapter();
    const legacy: Partial<PlanoData> = createMockPlanoData();
    legacy.dashboard!.tasks[0].label = 'Tâche gardée';
    delete legacy.objectives;
    delete legacy.agenda;
    localStorage.setItem('plano:data:v1', JSON.stringify(legacy));

    const loaded = adapter.load();

    expect(loaded?.dashboard.tasks[0].label).toBe('Tâche gardée');
    expect(loaded?.objectives.items.length).toBeGreaterThan(0);
    expect(loaded?.agenda.events.length).toBeGreaterThan(0);
  });

  it('drops lists saved before they moved to the API', () => {
    const adapter = new BrowserStoragePlanoDataAdapter();
    localStorage.setItem('plano:data:v1', JSON.stringify({ ...createMockPlanoData(), lists: [], listDetails: {} }));

    expect(Object.keys(adapter.load() ?? {})).toEqual(['version', 'dashboard', 'objectives', 'agenda']);
  });

  it('ignores malformed or unsupported stored data', () => {
    const adapter = new BrowserStoragePlanoDataAdapter();
    localStorage.setItem('plano:data:v1', '{broken');
    expect(adapter.load()).toBeNull();

    localStorage.setItem('plano:data:v1', JSON.stringify({ version: 2, lists: [] }));
    expect(adapter.load()).toBeNull();
  });
});
