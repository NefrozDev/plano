import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, untracked } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, concatMap, firstValueFrom, pipe } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../http/api-base-url';

/** Settings an older version kept in this browser, moved once to the account. */
export interface BrowserSettings<T> {
  /** What this browser changed from the defaults; null when nothing. */
  read(): Partial<T> | null;
  forget(): void;
}

export interface AccountSettingsConfig<T extends object> {
  /** The resource under the API root, e.g. `settings/agenda`. */
  path: string;
  /** What the API answers for an account that never changed anything. */
  defaults: T;
  /** Runs in the store's injection context. */
  browser?: () => BrowserSettings<T>;
}

/** Recently opened items are not settings: an account keeping only those still counts as untouched. */
const NOT_A_SETTING = new Set(['recentIds']);

/** The fields of `values` that differ from `defaults`. */
export function changedSettings<T extends object>(values: T, defaults: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        !NOT_A_SETTING.has(key) && JSON.stringify(value) !== JSON.stringify(defaults[key as keyof T]),
    ),
  ) as Partial<T>;
}

/**
 * A person's settings for one area, kept by the API and followed on every
 * device. Loaded when someone signs in, they read synchronously: the defaults
 * until the API answers, never another account's. Changes show at once and are
 * sent one after the other, so the server applies them in the order they were
 * made; a refused one reloads what the server holds.
 */
export function withAccountSettings<T extends object>(config: AccountSettingsConfig<T>) {
  return signalStoreFeature(
    withState<{ _owner: string | null; _values: T; _loadedFor: string | null }>({
      _owner: null,
      _values: config.defaults,
      _loadedFor: null,
    }),
    withProps(() => ({
      _auth: inject(AuthService),
      _http: inject(HttpClient),
      _url: `${inject(API_BASE_URL)}/${config.path}`,
      _browser: config.browser?.() ?? null,
    })),
    withComputed(({ _owner, _values, _auth }) => ({
      settings: computed(() => (_owner() === (_auth.user()?.id ?? null) ? _values() : config.defaults)),
    })),
    withMethods((store) => {
      const userId = (): string | null => store._auth.user()?.id ?? null;
      let loading: { userId: string; done: Promise<void> } | null = null;

      const fetch = async (id: string): Promise<void> => {
        try {
          const values = await firstValueFrom(store._http.get<T>(store._url));
          // Signed out or switched account meanwhile: these are not theirs.
          if (userId() !== id) return;
          patchState(store, { _owner: id, _values: values, _loadedFor: id });
          await moveFromBrowser(id, values);
        } catch {
          // The defaults stay; the next screen asking tries again.
        } finally {
          loading = null;
        }
      };

      /**
       * The first device to arrive moves its settings; a browser coming later
       * finds the account already set up and drops its own.
       */
      const moveFromBrowser = async (id: string, values: T): Promise<void> => {
        const local = store._browser?.read();
        if (!local) return;
        if (Object.keys(changedSettings(values, config.defaults)).length) {
          store._browser?.forget();
          return;
        }
        try {
          const saved = await firstValueFrom(store._http.patch<T>(store._url, local));
          if (userId() === id) patchState(store, { _values: saved });
          store._browser?.forget();
        } catch (error) {
          // Refused values would be refused forever; anything else goes again next time.
          if (error instanceof HttpErrorResponse && error.status === 400) store._browser?.forget();
        }
      };

      const reload = (): void => {
        const id = userId();
        if (!id) return;
        patchState(store, { _loadedFor: null });
        loading = { userId: id, done: fetch(id) };
      };

      const send = rxMethod<Partial<T>>(
        pipe(
          concatMap((changes) =>
            store._http.patch<T>(store._url, changes).pipe(
              catchError(() => {
                reload();
                return EMPTY;
              }),
            ),
          ),
        ),
      );

      return {
        /** Resolves once the signed-in person's settings are in, at once when they already are. */
        load(): Promise<void> {
          const id = userId();
          if (!id || store._loadedFor() === id) return Promise.resolve();
          if (loading?.userId !== id) loading = { userId: id, done: fetch(id) };
          return loading.done;
        },
        update(changes: Partial<T>): void {
          patchState(store, { _owner: userId(), _values: { ...store.settings(), ...changes } });
          send(changes);
        },
      };
    }),
    withHooks({
      onInit(store) {
        effect(() => {
          if (store._auth.user()) untracked(() => void store.load());
        });
      },
    }),
  );
}
