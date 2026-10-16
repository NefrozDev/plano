import { InjectionToken, Injectable } from '@angular/core';
import {
  createMockPlanoData,
  PlanoData,
  PlanoDataAdapter,
} from '@plano/common';

export class MemoryPlanoDataAdapter implements PlanoDataAdapter {
  private data: PlanoData | null = null;

  load(): PlanoData | null {
    return this.data ? structuredClone(this.data) : null;
  }

  save(data: PlanoData): void {
    this.data = structuredClone(data);
  }
}

@Injectable()
export class BrowserStoragePlanoDataAdapter implements PlanoDataAdapter {
  private readonly key = 'plano:data:v1';

  load(): PlanoData | null {
    try {
      const value = localStorage.getItem(this.key);
      if (!value) return null;
      const parsed = JSON.parse(value) as Partial<PlanoData>;
      // Objectives and agenda were added to v1 after release: backfill them instead of
      // discarding the data a user already saved.
      if (parsed.objectives == null) {
        parsed.objectives = createMockPlanoData().objectives;
      }
      if (parsed.agenda == null) {
        parsed.agenda = createMockPlanoData().agenda;
      }
      const valid =
        parsed.version === 1 &&
        typeof parsed.dashboard === 'object' &&
        parsed.dashboard !== null &&
        Array.isArray(parsed.dashboard.tasks) &&
        Array.isArray(parsed.dashboard.weekDays) &&
        typeof parsed.objectives === 'object' &&
        Array.isArray(parsed.objectives.items) &&
        typeof parsed.agenda === 'object' &&
        Array.isArray(parsed.agenda.events);
      // Rebuilt from the known keys: data now served by the API (lists) is dropped
      // from storage on the next save.
      return valid
        ? { version: 1, dashboard: parsed.dashboard!, objectives: parsed.objectives, agenda: parsed.agenda }
        : null;
    } catch {
      return null;
    }
  }

  save(data: PlanoData): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      // Keep the app usable when storage is unavailable or full.
    }
  }
}

export const PLANO_DATA_ADAPTER = new InjectionToken<PlanoDataAdapter>(
  'PLANO_DATA_ADAPTER',
  { providedIn: 'root', factory: () => new MemoryPlanoDataAdapter() },
);

export function initialPlanoData(adapter: PlanoDataAdapter): PlanoData {
  return adapter.load() ?? createMockPlanoData();
}
