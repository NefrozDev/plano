import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, catchError, debounceTime, distinctUntilChanged, firstValueFrom, map, of, switchMap } from 'rxjs';
import { ProfileService } from '../../core/users/profile.service';
import { AutofocusDirective } from '../../shared/ui/autofocus.directive';

/** Same rule as registration and the API. */
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
export const AVAILABILITY_DEBOUNCE_MS = 300;

type Status = 'unchanged' | 'invalid' | 'checking' | 'available' | 'taken' | 'unknown';

/** The profile's `@username`: a tap turns it into a field that checks the name is free as you type. */
@Component({
  selector: 'app-username-editor',
  imports: [AutofocusDirective, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './username-editor.component.html',
  styleUrl: './username-editor.component.scss',
})
export class UsernameEditorComponent {
  private readonly profile = inject(ProfileService);
  private readonly destroyRef = inject(DestroyRef);

  readonly username = input.required<string>();

  readonly editing = signal(false);
  readonly draft = signal('');
  readonly saving = signal(false);
  /** Translation key of the last save error, empty when none. */
  readonly saveError = signal('');
  /** Availability answered for `name`; stale answers are ignored. */
  private readonly checked = signal<{ name: string; available: boolean | null } | null>(null);

  private readonly name = computed(() => this.draft().trim().toLowerCase());
  readonly status = computed<Status>(() => {
    const name = this.name();
    if (name === this.username().toLowerCase()) return 'unchanged';
    if (!USERNAME_PATTERN.test(name)) return 'invalid';
    const checked = this.checked();
    if (checked?.name !== name) return 'checking';
    if (checked.available === null) return 'unknown';
    return checked.available ? 'available' : 'taken';
  });
  /** An unknown answer (check failed) still lets the API decide on save. */
  readonly canSave = computed(
    () => !this.saving() && (this.status() === 'available' || this.status() === 'unknown'),
  );

  constructor() {
    toObservable(this.name)
      .pipe(
        debounceTime(AVAILABILITY_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((name): Observable<{ name: string; available: boolean | null } | null> =>
          !this.editing() || name === this.username().toLowerCase() || !USERNAME_PATTERN.test(name)
            ? of(null)
            : this.profile.isUsernameAvailable(name).pipe(
                map((available) => ({ name, available })),
                catchError(() => of({ name, available: null })),
              ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((checked) => {
        if (checked) this.checked.set(checked);
      });
  }

  start(): void {
    this.draft.set(this.username());
    this.saveError.set('');
    this.editing.set(true);
  }

  cancel(): void {
    this.editing.set(false);
    this.saveError.set('');
  }

  async save(): Promise<void> {
    if (this.status() === 'unchanged') {
      this.cancel();
      return;
    }
    if (!this.canSave()) return;
    const name = this.name();
    this.saving.set(true);
    this.saveError.set('');
    try {
      await firstValueFrom(this.profile.changeUsername(name));
      this.editing.set(false);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        // Taken between the check and the save.
        this.checked.set({ name, available: false });
      } else {
        this.saveError.set('settings.profile.username.failed');
      }
    } finally {
      this.saving.set(false);
    }
  }
}
