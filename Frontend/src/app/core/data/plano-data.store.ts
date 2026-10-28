import { Injectable, computed, inject, signal } from '@angular/core';
import type { PlanoData } from '@plano/common';
import { AuthService } from '../auth/auth.service';
import { PLANO_DATA_ADAPTER, initialPlanoData } from './plano-data.adapter';

@Injectable({ providedIn: 'root' })
export class PlanoDataStore {
  private readonly adapter = inject(PLANO_DATA_ADAPTER);
  private readonly auth = inject(AuthService);
  /** Latest update, tagged with the account it belongs to. */
  private readonly changes = signal<{ userId: string | undefined; data: PlanoData } | null>(null);

  /** The signed-in account's data: reloaded from the adapter whenever the account changes. */
  readonly data = computed(() => {
    const userId = this.auth.user()?.id;
    const changes = this.changes();
    return changes && changes.userId === userId ? changes.data : initialPlanoData(this.adapter);
  });

  update(updateData: (current: PlanoData) => PlanoData): void {
    const next = updateData(this.data());
    this.changes.set({ userId: this.auth.user()?.id, data: next });
    this.adapter.save(next);
  }
}
