import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { GroupDetails, GroupMember } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
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
})
export class GroupSetupComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly groups = inject(GroupsService);
  private readonly auth = inject(AuthService);
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

  submitted = false;
  joinSubmitted = false;

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
    this.submitted = true;
    const name = this.trimControl(this.form.controls.name);
    if (this.form.invalid || this.busyAction()) {
      this.form.markAllAsTouched();
      return;
    }

    this.runGroupAction('create', this.groups.create({ name }), true);
  }

  join(): void {
    this.joinSubmitted = true;
    const inviteCode = this.joinForm.controls.inviteCode.value
      .trim()
      .toUpperCase();
    this.joinForm.controls.inviteCode.setValue(inviteCode, {
      emitEvent: false,
    });
    this.joinForm.controls.inviteCode.updateValueAndValidity({
      emitEvent: false,
    });
    if (this.joinForm.invalid || this.busyAction()) {
      this.joinForm.markAllAsTouched();
      return;
    }

    this.runGroupAction('join', this.groups.join({ inviteCode }), true);
  }

  rename(): void {
    const name = this.trimControl(this.renameForm.controls.name);
    if (this.renameForm.invalid || this.busyAction()) {
      this.renameForm.markAllAsTouched();
      return;
    }
    this.runGroupAction(
      'rename',
      this.groups.update(name),
      false,
      'Nom modifié.',
    );
  }

  async copyInviteCode(): Promise<void> {
    const code = this.group()?.inviteCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1800);
    } catch {
      this.actionMessage.set(`Code d’invitation : ${code}`);
    }
  }

  rotateInviteCode(): void {
    if (
      !window.confirm(
        'Générer un nouveau code ? L’ancien code ne permettra plus de rejoindre le groupe.',
      )
    ) {
      return;
    }
    this.runGroupAction(
      'rotate',
      this.groups.rotateInviteCode(),
      false,
      'Nouveau code généré.',
    );
  }

  transferOwnership(member: GroupMember): void {
    if (
      !window.confirm(
        `Transférer la propriété du groupe à ${this.memberName(member)} ?`,
      )
    ) {
      return;
    }
    this.runGroupAction(
      `transfer-${member.id}`,
      this.groups.transferOwnership(member.id),
      false,
      'Propriété transférée.',
    );
  }

  removeMember(member: GroupMember): void {
    if (!window.confirm(`Retirer ${this.memberName(member)} du groupe ?`))
      return;
    this.clearFeedback();
    this.busyAction.set(`remove-${member.id}`);
    this.groups
      .removeMember(member.id)
      .pipe(finalize(() => this.busyAction.set('')))
      .subscribe({
        next: () => {
          this.group.update((group) =>
            group
              ? {
                  ...group,
                  members: group.members.filter(({ id }) => id !== member.id),
                }
              : null,
          );
          this.actionMessage.set('Membre retiré du groupe.');
        },
        error: (error: unknown) =>
          this.submissionError.set(this.errorMessage(error)),
      });
  }

  leaveGroup(): void {
    this.runVoidAction(
      'leave',
      this.groups.leave(),
      'Vous avez quitté le groupe.',
    );
  }

  deleteGroup(): void {
    this.runVoidAction(
      'delete',
      this.groups.delete(),
      'Le groupe a été supprimé.',
    );
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

  private runGroupAction(
    action: string,
    request: Observable<GroupDetails>,
    navigateHome: boolean,
    successMessage = '',
  ): void {
    this.clearFeedback();
    this.busyAction.set(action);
    request.pipe(finalize(() => this.busyAction.set(''))).subscribe({
      next: (group) => {
        this.setGroup(group);
        this.dialog.set(null);
        this.actionMessage.set(successMessage);
        if (navigateHome) void this.router.navigateByUrl('/');
      },
      error: (error: unknown) =>
        this.submissionError.set(this.errorMessage(error)),
    });
  }

  private runVoidAction(
    action: string,
    request: Observable<void>,
    successMessage: string,
  ): void {
    this.clearFeedback();
    this.busyAction.set(action);
    request.pipe(finalize(() => this.busyAction.set(''))).subscribe({
      next: () => {
        this.setGroup(null);
        this.dialog.set(null);
        this.actionMessage.set(successMessage);
      },
      error: (error: unknown) =>
        this.submissionError.set(this.errorMessage(error)),
    });
  }

  private trimControl(control: FormControl<string>): string {
    const value = control.value.trim();
    control.setValue(value, { emitEvent: false });
    control.updateValueAndValidity({ emitEvent: false });
    return value;
  }

  private clearFeedback(): void {
    this.submissionError.set('');
    this.actionMessage.set('');
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Impossible de joindre Plano. Vérifiez votre connexion.';
      }
      const message = (error.error as { message?: unknown } | null)?.message;
      if (Array.isArray(message)) return message.join(' ');
      if (typeof message === 'string') return message;
    }
    return 'L’action a échoué. Veuillez réessayer.';
  }
}
