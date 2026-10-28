import { InjectionToken, Injectable, inject } from '@angular/core';
import {
  createEmptyPlanoData,
  PlanoData,
  PlanoDataAdapter,
} from '@plano/common';
import { AuthService } from '../auth/auth.service';

export class MemoryPlanoDataAdapter implements PlanoDataAdapter {
  constructor(private data: PlanoData | null = null) {}

  load(): PlanoData | null {
    return this.data ? structuredClone(this.data) : null;
  }

  save(data: PlanoData): void {
    this.data = structuredClone(data);
  }
}

@Injectable()
export class BrowserStoragePlanoDataAdapter implements PlanoDataAdapter {
  private readonly auth = inject(AuthService);

  /** One entry per account, so people sharing a browser never see each other's data. */
  private key(): string | null {
    const userId = this.auth.user()?.id;
    return userId ? `plano:data:v1:${userId}` : null;
  }

  load(): PlanoData | null {
    const key = this.key();
    if (!key) return null;
    try {
      const value = localStorage.getItem(key);
      if (!value) return null;
      const parsed = JSON.parse(value) as Partial<PlanoData>;
      // Objectives and agenda were added to v1 after release: backfill them instead of
      // discarding the data a user already saved.
      if (parsed.objectives == null) {
        parsed.objectives = createEmptyPlanoData().objectives;
      }
      if (parsed.agenda == null) {
        parsed.agenda = createEmptyPlanoData().agenda;
      }
      const valid =
        parsed.version === 1 &&
        typeof parsed.dashboard === 'object' &&
        parsed.dashboard !== null &&
        Array.isArray(parsed.dashboard.tasks) &&
        typeof parsed.objectives === 'object' &&
        Array.isArray(parsed.objectives.items) &&
        typeof parsed.agenda === 'object' &&
        Array.isArray(parsed.agenda.events);
      // Rebuilt from the known keys: data no longer stored here (lists, now served by
      // the API, and the computed week strip) is dropped from storage on the next save.
      return valid
        ? { version: 1, dashboard: { tasks: parsed.dashboard!.tasks }, objectives: parsed.objectives, agenda: parsed.agenda }
        : null;
    } catch {
      return null;
    }
  }

  save(data: PlanoData): void {
    const key = this.key();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
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
  return adapter.load() ?? createEmptyPlanoData();
}
