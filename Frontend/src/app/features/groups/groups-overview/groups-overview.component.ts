import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { httpErrorMessage } from '../../../core/http/http-error-message';
import { GroupDetails } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
import { AuthShellComponent } from '../../auth/auth-shell/auth-shell.component';

type SetupMode = 'choice' | 'create' | 'join';

/**
 * `/groups`: every group of the user, and forms to create or join another one.
 * Without any group it doubles as the onboarding step after registration.
 */
@Component({
  selector: 'app-groups-overview',
  imports: [AuthShellComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './groups-overview.component.html',
  styleUrls: ['../groups.scss', './groups-overview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupsOverviewComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly groupsApi = inject(GroupsService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    name: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    ],
  });
  readonly joinForm = this.formBuilder.nonNullable.group({
    inviteCode: [
      '',
      [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{8}$/)],
    ],
  });

  readonly groups = signal<readonly GroupDetails[]>([]);
  readonly loading = signal(true);
  readonly mode = signal<SetupMode>('choice');
  readonly submissionError = signal('');
  readonly busyAction = signal('');
  readonly showCreateForm = computed(() => this.mode() === 'create');
  readonly submitting = computed(() => this.busyAction() === 'create');

  readonly submitted = signal(false);
  readonly joinSubmitted = signal(false);

  ngOnInit(): void {
    this.loadGroups();
  }

  loadGroups(): void {
    this.loading.set(true);
    this.submissionError.set('');
    this.groupsApi
      .getAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (groups) => this.groups.set(groups),
        error: (error: unknown) =>
          this.submissionError.set(this.errorMessage(error)),
      });
  }

  openCreateForm(): void {
    this.submissionError.set('');
    this.mode.set('create');
  }

  closeCreateForm(): void {
    this.mode.set('choice');
    this.submissionError.set('');
  }

  showJoinInfo(): void {
    this.submissionError.set('');
    this.mode.set('join');
  }

  closeJoinForm(): void {
    this.mode.set('choice');
    this.submissionError.set('');
  }

  skip(): void {
    void this.router.navigateByUrl('/');
  }

  submit(): void {
    this.submitted.set(true);
    const name = this.normalizeControl(this.form.controls.name);
    if (this.form.invalid || this.busyAction()) {
      this.form.markAllAsTouched();
      return;
    }
    this.runAction('create', this.groupsApi.create({ name }));
  }

  join(): void {
    this.joinSubmitted.set(true);
    const inviteCode = this.normalizeControl(this.joinForm.controls.inviteCode, (value) =>
      value.trim().toUpperCase(),
    );
    if (this.joinForm.invalid || this.busyAction()) {
      this.joinForm.markAllAsTouched();
      return;
    }
    this.runAction('join', this.groupsApi.join({ inviteCode }));
  }

  /** Creating or joining opens the group, where its invite code can be shared. */
  private runAction(action: string, request: Observable<GroupDetails>): void {
    this.submissionError.set('');
    this.busyAction.set(action);
    request.pipe(finalize(() => this.busyAction.set(''))).subscribe({
      next: (group) => void this.router.navigate(['/groups', group.id]),
      error: (error: unknown) =>
        this.submissionError.set(this.errorMessage(error)),
    });
  }

  private errorMessage(error: unknown): string {
    return httpErrorMessage(error, {
      useServerMessage: true,
      fallback: 'L’action a échoué. Veuillez réessayer.',
    });
  }

  /** Writes the cleaned value back so validators and the field show what is sent. */
  private normalizeControl(
    control: FormControl<string>,
    normalize: (value: string) => string = (value) => value.trim(),
  ): string {
    const value = normalize(control.value);
    control.setValue(value, { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
    return value;
  }
}
