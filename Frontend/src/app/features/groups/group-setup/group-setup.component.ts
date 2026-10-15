import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { Router } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ClipboardService } from '../../../core/browser/clipboard.service';
import { httpErrorMessage } from '../../../core/http/http-error-message';
import { GroupDetails, GroupMember } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ModalDialogComponent } from '../../../shared/ui/modal-dialog.component';
import { ToastComponent } from '../../../shared/ui/toast.component';
import { AuthShellComponent } from '../../auth/auth-shell/auth-shell.component';

type SetupMode = 'choice' | 'create' | 'join';
type GroupDialog = 'rename' | 'danger';

@Component({
  selector: 'app-group-setup',
  standalone: true,
  imports: [
    AuthShellComponent,
    ModalDialogComponent,
    ReactiveFormsModule,
    ToastComponent,
  ],
  templateUrl: './group-setup.component.html',
  styleUrl: './group-setup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupSetupComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly groups = inject(GroupsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly clipboard = inject(ClipboardService);
  private copiedTimer?: ReturnType<typeof setTimeout>;

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
  readonly renameForm = this.formBuilder.nonNullable.group({
    name: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    ],
  });

  readonly group = signal<GroupDetails | null>(null);
  readonly loading = signal(true);
  readonly mode = signal<SetupMode>('choice');
  /** Open management modal: rename, or delete/leave depending on the role. */
  readonly dialog = signal<GroupDialog | null>(null);
  readonly submissionError = signal('');
  readonly actionMessage = signal('');
  readonly busyAction = signal('');
  readonly linkCopied = signal(false);
  readonly isOwner = computed(() => this.group()?.role === 'owner');
  readonly currentUserId = computed(() => this.auth.user()?.id ?? '');
  readonly showCreateForm = computed(() => this.mode() === 'create');
  readonly submitting = computed(() => this.busyAction() === 'create');

  readonly submitted = signal(false);
  readonly joinSubmitted = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  ngOnInit(): void {
    this.loadGroup();
  }

  loadGroup(): void {
    this.loading.set(true);
    this.submissionError.set('');
    this.groups
      .getMine()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (group) => this.setGroup(group),
        error: (error: unknown) =>
          this.submissionError.set(this.errorMessage(error)),
      });
  }

  openCreateForm(): void {
    this.clearFeedback();
    this.mode.set('create');
  }

  closeCreateForm(): void {
    this.mode.set('choice');
    this.submissionError.set('');
  }

  showJoinInfo(): void {
    this.clearFeedback();
    this.mode.set('join');
  }

  closeJoinForm(): void {
    this.mode.set('choice');
    this.submissionError.set('');
  }

  openDialog(dialog: GroupDialog): void {
    this.clearFeedback();
    if (dialog === 'rename') {
      this.renameForm.reset({ name: this.group()?.name ?? '' });
    }
    this.dialog.set(dialog);
  }

  closeDialog(): void {
    this.dialog.set(null);
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
    this.runAction('create', this.groups.create({ name }), (group) => this.enterGroup(group));
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
    this.runAction('join', this.groups.join({ inviteCode }), (group) => this.enterGroup(group));
  }

  rename(): void {
    const name = this.normalizeControl(this.renameForm.controls.name);
    if (this.renameForm.invalid || this.busyAction()) {
      this.renameForm.markAllAsTouched();
      return;
    }
    this.runAction('rename', this.groups.update(name), (group) => this.setGroup(group), 'Nom modifié.');
  }

  async copyInviteCode(): Promise<void> {
    const code = this.group()?.inviteCode;
    if (!code) return;
    if (!(await this.clipboard.copy(code))) {
      this.actionMessage.set(`Code d’invitation : ${code}`);
      return;
    }
    this.linkCopied.set(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.linkCopied.set(false), 1800);
  }

  async rotateInviteCode(): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Générer un nouveau code ?',
      message: 'L’ancien code ne permettra plus de rejoindre le groupe.',
      confirmLabel: 'Générer',
    });
    if (!confirmed) return;
    this.runAction(
      'rotate',
      this.groups.rotateInviteCode(),
      (group) => this.setGroup(group),
      'Nouveau code généré.',
    );
  }

  async transferOwnership(member: GroupMember): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Transférer la propriété ?',
      message: `${this.memberName(member)} deviendra propriétaire du groupe.`,
      confirmLabel: 'Transférer',
    });
    if (!confirmed) return;
    this.runAction(
      `transfer-${member.id}`,
      this.groups.transferOwnership(member.id),
      (group) => this.setGroup(group),
      'Propriété transférée.',
    );
  }

  async removeMember(member: GroupMember): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: 'Retirer ce membre ?',
      message: `${this.memberName(member)} n’aura plus accès au groupe.`,
      confirmLabel: 'Retirer',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.runAction(
      `remove-${member.id}`,
      this.groups.removeMember(member.id),
      () =>
        this.group.update((group) =>
          group ? { ...group, members: group.members.filter(({ id }) => id !== member.id) } : null,
        ),
      'Membre retiré du groupe.',
    );
  }

  leaveGroup(): void {
    this.runAction('leave', this.groups.leave(), () => this.setGroup(null), 'Vous avez quitté le groupe.');
  }

  deleteGroup(): void {
    this.runAction('delete', this.groups.delete(), () => this.setGroup(null), 'Le groupe a été supprimé.');
  }

  memberName(member: GroupMember): string {
    return `${member.firstName} ${member.lastName}`.trim() || member.username;
  }

  memberInitials(member: GroupMember): string {
    return (
      `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase() ||
      member.username.slice(0, 2).toUpperCase()
    );
  }

  private setGroup(group: GroupDetails | null): void {
    this.group.set(group);
    if (group) {
      this.renameForm.controls.name.setValue(group.name);
      this.mode.set('choice');
    }
  }

  /** Creating or joining a group completes the onboarding step. */
  private enterGroup(group: GroupDetails): void {
    this.setGroup(group);
    void this.router.navigateByUrl('/');
  }

  /**
   * Runs one server action at a time: `busyAction` names it for the buttons,
   * success closes any dialog and shows `successMessage`, failure shows the error.
   */
  private runAction<T>(
    action: string,
    request: Observable<T>,
    onSuccess: (result: T) => void,
    successMessage = '',
  ): void {
    this.clearFeedback();
    this.busyAction.set(action);
    request.pipe(finalize(() => this.busyAction.set(''))).subscribe({
      next: (result) => {
        onSuccess(result);
        this.dialog.set(null);
        this.actionMessage.set(successMessage);
      },
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

  private clearFeedback(): void {
    this.submissionError.set('');
    this.actionMessage.set('');
  }
}