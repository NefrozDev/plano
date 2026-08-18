import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { GroupsService } from '../../../core/groups/groups.service';
import { AuthShellComponent } from '../../auth/auth-shell/auth-shell.component';

@Component({
  selector: 'app-group-setup',
  standalone: true,
  imports: [AuthShellComponent, ReactiveFormsModule],
  templateUrl: './group-setup.component.html',
  styleUrl: './group-setup.component.scss',
})
export class GroupSetupComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly groups = inject(GroupsService);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    name: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    ],
  });
  readonly showCreateForm = signal(false);
  readonly joinMessage = signal('');
  readonly submissionError = signal('');
  readonly submitting = signal(false);
  submitted = false;

  openCreateForm(): void {
    this.joinMessage.set('');
    this.showCreateForm.set(true);
  }

  closeCreateForm(): void {
    this.showCreateForm.set(false);
    this.submissionError.set('');
  }

  showJoinInfo(): void {
    this.joinMessage.set(
      'La possibilité de rejoindre un groupe sera bientôt disponible.',
    );
  }

  skip(): void {
    void this.router.navigateByUrl('/');
  }

  submit(): void {
    this.submitted = true;
    this.submissionError.set('');
    const name = this.form.controls.name.value.trim();
    this.form.controls.name.setValue(name, { emitEvent: false });
    this.form.controls.name.updateValueAndValidity({ emitEvent: false });

    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.groups
      .create({ name })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => void this.router.navigateByUrl('/'),
        error: (error: unknown) => this.handleError(error),
      });
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.submissionError.set('Vous appartenez déjà à un groupe.');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 0) {
      this.submissionError.set(
        'Impossible de joindre Plano. Vérifiez votre connexion.',
      );
      return;
    }
    this.submissionError.set(
      'La création du groupe a échoué. Veuillez réessayer.',
    );
  }
}
