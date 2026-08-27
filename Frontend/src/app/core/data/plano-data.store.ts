import { Injectable, inject, signal } from '@angular/core';
import type { PlanoData } from '@plano/common';
import { PLANO_DATA_ADAPTER, initialPlanoData } from './plano-data.adapter';

@Injectable({ providedIn: 'root' })
export class PlanoDataStore {
  private readonly adapter = inject(PLANO_DATA_ADAPTER);
  private readonly dataState = signal<PlanoData>(initialPlanoData(this.adapter));

  readonly data = this.dataState.asReadonly();

  update(updateData: (current: PlanoData) => PlanoData): void {
    const next = updateData(this.dataState());
    this.dataState.set(next);
    this.adapter.save(next);
  }
}
