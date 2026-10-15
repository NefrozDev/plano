import { HttpErrorResponse } from '@angular/common/http';
import {
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { GroupDetails } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
import { GroupSetupComponent } from './group-setup.component';

describe('GroupSetupComponent', () => {
  let groups: jasmine.SpyObj<GroupsService>;
  let component: GroupSetupComponent;
  let router: Router;
  const group: GroupDetails = {
    id: 'group-1',
    name: 'Les Explorateurs',
    inviteCode: 'ABC12345',
    role: 'owner',
    createdAt: '2030-01-01T00:00:00Z',
    members: [
      {
        id: 'user-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        email: 'ada@example.com',
        role: 'owner',
        joinedAt: '2030-01-01T00:00:00Z',
      },
    ],
  };

  beforeEach(async () => {
    groups = jasmine.createSpyObj<GroupsService>('GroupsService', [
      'getMine',
      'create',
      'join',
      'update',
      'rotateInviteCode',
      'transferOwnership',
      'removeMember',
      'leave',
      'delete',
    ]);
    groups.getMine.and.returnValue(of(null));
    groups.create.and.returnValue(of(group));
    groups.join.and.returnValue(of({ ...group, role: 'member' }));
    groups.update.and.returnValue(of(group));
    groups.rotateInviteCode.and.returnValue(of(group));
    groups.transferOwnership.and.returnValue(of({ ...group, role: 'member' }));
    groups.removeMember.and.returnValue(of(undefined));
    groups.leave.and.returnValue(of(undefined));
    groups.delete.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [GroupSetupComponent],
      providers: [
        provideRouter([]),
        { provide: GroupsService, useValue: groups },
        { provide: AuthService, useValue: { user: () => ({ id: 'user-1' }) } },
      ],
    }).compileComponents();
    component = TestBed.createComponent(GroupSetupComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  it('loads the current group and prepares its editable name', () => {
    groups.getMine.and.returnValue(of(group));
    component.ngOnInit();

    expect(component.group()).toEqual(group);
    expect(component.renameForm.controls.name.value).toBe('Les Explorateurs');
    expect(component.loading()).toBeFalse();
  });

  it('opens, closes, and validates the create form', () => {
    component.openCreateForm();
    expect(component.showCreateForm()).toBeTrue();
    component.form.controls.name.setValue(' ');
    component.submit();
    expect(groups.create).not.toHaveBeenCalled();
    component.closeCreateForm();
    expect(component.showCreateForm()).toBeFalse();
  });

  it('trims, creates, and navigates home', () => {
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    component.form.controls.name.setValue('  Les Explorateurs  ');
    component.submit();

    expect(groups.create).toHaveBeenCalledOnceWith({
      name: 'Les Explorateurs',
    });
    expect(component.group()).toEqual(group);
    expect(navigate).toHaveBeenCalledOnceWith('/');
  });

  it('normalizes and accepts an invitation code', () => {
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    component.showJoinInfo();
    component.joinForm.controls.inviteCode.setValue('abcd1234');
    component.join();

    expect(groups.join).toHaveBeenCalledOnceWith({ inviteCode: 'ABCD1234' });
    expect(navigate).toHaveBeenCalledOnceWith('/');
  });

  it('renames the group and surfaces backend errors', () => {
    component.group.set(group);
    component.renameForm.controls.name.setValue('  Nouveau nom  ');
    component.rename();
    expect(groups.update).toHaveBeenCalledOnceWith('Nouveau nom');
    expect(component.actionMessage()).toContain('modifié');

    groups.update.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { message: 'Action interdite.' },
          }),
      ),
    );
    component.renameForm.controls.name.setValue('Encore un nom');
    component.rename();
    expect(component.submissionError()).toBe('Action interdite.');
  });

  it('supports skipping and maps offline failures', () => {
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    groups.getMine.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    component.loadGroup();
    expect(component.submissionError()).toContain('Impossible de joindre');
    component.skip();
    expect(navigate).toHaveBeenCalledOnceWith('/');
  });
  describe('owner actions', () => {
    const member = {
      id: 'user-2',
      firstName: 'Grace',
      lastName: 'Hopper',
      username: 'grace',
      email: 'grace@example.com',
      role: 'member' as const,
      joinedAt: '2030-01-02T00:00:00Z',
    };
    let confirm: jasmine.Spy;

    beforeEach(() => {
      component.group.set({ ...group, members: [...group.members, member] });
      confirm = spyOn(window, 'confirm').and.returnValue(true);
    });

    it('does nothing when the user cancels a confirmation', () => {
      confirm.and.returnValue(false);
      component.rotateInviteCode();
      component.transferOwnership(member);
      component.removeMember(member);

      expect(groups.rotateInviteCode).not.toHaveBeenCalled();
      expect(groups.transferOwnership).not.toHaveBeenCalled();
      expect(groups.removeMember).not.toHaveBeenCalled();
    });

    it('rotates the invite code and transfers ownership', () => {
      component.rotateInviteCode();
      expect(component.actionMessage()).toBe('Nouveau code généré.');

      component.transferOwnership(member);
      expect(confirm).toHaveBeenCalledWith(
        'Transférer la propriété du groupe à Grace Hopper ?',
      );
      expect(groups.transferOwnership).toHaveBeenCalledOnceWith('user-2');
      expect(component.isOwner()).toBeFalse();
      expect(component.busyAction()).toBe('');
    });

    it('removes a member locally once the server confirms', () => {
      component.removeMember(member);

      expect(groups.removeMember).toHaveBeenCalledOnceWith('user-2');
      expect(component.group()?.members.map(({ id }) => id)).toEqual(['user-1']);
      expect(component.actionMessage()).toBe('Membre retiré du groupe.');
    });

    it('keeps the member and reports the error when removal fails', () => {
      groups.removeMember.and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { message: ['Membre inconnu.', 'Réessayez.'] },
            }),
        ),
      );
      component.removeMember(member);

      // Validation errors arrive as an array of messages.
      expect(component.submissionError()).toBe('Membre inconnu. Réessayez.');
      expect(component.group()?.members.length).toBe(2);
    });

    it('handles a removal finishing after the group disappeared', () => {
      groups.removeMember.and.callFake(() => {
        component.group.set(null);
        return of(undefined);
      });
      component.removeMember(member);

      expect(component.group()).toBeNull();
    });

    it('leaves or deletes the group and clears it', () => {
      component.leaveGroup();
      expect(component.group()).toBeNull();
      expect(component.actionMessage()).toBe('Vous avez quitté le groupe.');

      component.group.set(group);
      component.openDialog('danger');
      component.deleteGroup();
      // The modal is the confirmation step: no extra browser prompt.
      expect(confirm).not.toHaveBeenCalled();
      expect(component.dialog()).toBeNull();
      expect(component.actionMessage()).toBe('Le groupe a été supprimé.');
    });

    it('uses a generic message for unexpected failures', () => {
      groups.delete.and.returnValue(throwError(() => new Error('boom')));
      component.deleteGroup();

      expect(component.submissionError()).toBe(
        'L’action a échoué. Veuillez réessayer.',
      );
      expect(component.group()).not.toBeNull();
    });
  });

  describe('invite code', () => {
    it('copies the code and resets the confirmation after a delay', fakeAsync(() => {
      const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
      component.group.set(group);

      void component.copyInviteCode();
      flushMicrotasks();
      expect(writeText).toHaveBeenCalledOnceWith('ABC12345');
      expect(component.linkCopied()).toBeTrue();

      tick(1800);
      expect(component.linkCopied()).toBeFalse();
    }));

    it('shows the code when the clipboard is unavailable', async () => {
      spyOn(navigator.clipboard, 'writeText').and.rejectWith(new Error('denied'));
      component.group.set(group);

      await component.copyInviteCode();

      expect(component.actionMessage()).toBe('Code d’invitation : ABC12345');
    });

    it('ignores copy requests without a group', async () => {
      const writeText = spyOn(navigator.clipboard, 'writeText');
      await component.copyInviteCode();
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  describe('validation and busy state', () => {
    it('rejects malformed invite codes', () => {
      component.showJoinInfo();
      component.joinForm.controls.inviteCode.setValue(' abc ');
      component.join();

      expect(groups.join).not.toHaveBeenCalled();
      expect(component.joinForm.controls.inviteCode.value).toBe('ABC');
      component.closeJoinForm();
      expect(component.mode()).toBe('choice');
    });

    it('ignores submissions while another action is running', () => {
      component.busyAction.set('rotate');
      component.form.controls.name.setValue('Valide');
      component.submit();
      component.joinForm.controls.inviteCode.setValue('ABCD1234');
      component.join();
      component.renameForm.controls.name.setValue('Valide');
      component.rename();

      expect(groups.create).not.toHaveBeenCalled();
      expect(groups.join).not.toHaveBeenCalled();
      expect(groups.update).not.toHaveBeenCalled();
    });

    it('reports backend errors without a usable message', () => {
      groups.create.and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: null })),
      );
      component.form.controls.name.setValue('Valide');
      component.submit();

      expect(component.submissionError()).toBe(
        'L’action a échoué. Veuillez réessayer.',
      );
      expect(component.submitting()).toBeFalse();
    });
  });

  it('formats member names and initials with username fallbacks', () => {
    const anonymous = { ...group.members[0], firstName: '', lastName: '' };

    expect(component.memberName(group.members[0])).toBe('Ada Lovelace');
    expect(component.memberInitials(group.members[0])).toBe('AL');
    expect(component.memberName(anonymous)).toBe('ada');
    expect(component.memberInitials(anonymous)).toBe('AD');
    expect(component.currentUserId()).toBe('user-1');
  });

  it('renders the owner management view', () => {
    groups.getMine.and.returnValue(of(group));
    const fixture = TestBed.createComponent(GroupSetupComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Les Explorateurs',
    );
    expect(fixture.componentInstance.isOwner()).toBeTrue();
  });

  it('goes back home from the back bubble of the management view', () => {
    groups.getMine.and.returnValue(of(group));
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const fixture = TestBed.createComponent(GroupSetupComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const back = element.querySelector('.back-bubble') as HTMLButtonElement;

    expect(back.getAttribute('aria-label')).toBe('Retour à l’accueil');
    expect(element.textContent).not.toContain('Retour à l’accueil');

    back.click();
    expect(navigate).toHaveBeenCalledOnceWith('/');
  });
  describe('management modals', () => {
    function renderGroup(role: 'owner' | 'member') {
      groups.getMine.and.returnValue(of({ ...group, role }));
      const fixture = TestBed.createComponent(GroupSetupComponent);
      fixture.detectChanges();
      return { fixture, element: fixture.nativeElement as HTMLElement };
    }

    const bubbleLabels = (element: HTMLElement): (string | null)[] =>
      Array.from(element.querySelectorAll('.group-tools button')).map((button) =>
        button.getAttribute('aria-label'),
      );

    it('shows rename and delete bubbles to the owner, leave to members', () => {
      expect(bubbleLabels(renderGroup('owner').element)).toEqual([
        'Renommer le groupe',
        'Supprimer le groupe',
      ]);
      expect(bubbleLabels(renderGroup('member').element)).toEqual([
        'Quitter le groupe',
      ]);
    });

    it('renames from the modal, which starts from the current name and closes on success', () => {
      const { fixture, element } = renderGroup('owner');
      component = fixture.componentInstance;
      component.renameForm.controls.name.setValue('Brouillon abandonné');

      (element.querySelector('.group-tools button') as HTMLButtonElement).click();
      fixture.detectChanges();
      TestBed.flushEffects();
      const dialog = element.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBeTrue();
      expect(component.renameForm.controls.name.value).toBe('Les Explorateurs');

      component.renameForm.controls.name.setValue('Les Aventuriers');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      TestBed.flushEffects();

      expect(groups.update).toHaveBeenCalledOnceWith('Les Aventuriers');
      expect(component.dialog()).toBeNull();
      expect(dialog.open).toBeFalse();
    });

    it('confirms a rename with a floating toast instead of an inline message', () => {
      const { fixture, element } = renderGroup('owner');
      component = fixture.componentInstance;
      component.openDialog('rename');
      component.renameForm.controls.name.setValue('Les Aventuriers');
      component.rename();
      fixture.detectChanges();

      expect(element.querySelector('app-toast .toast')?.textContent).toContain('Nom modifié.');
      expect(element.querySelector('.success-message')).toBeNull();
      // Projected into the frame's sticky overlay strip, outside the page flow.
      expect(element.querySelector('.overlay-anchor app-toast')).not.toBeNull();

      (element.querySelector('app-toast .toast') as HTMLButtonElement).click();
      expect(component.actionMessage()).toBe('');
    });

    it('keeps the modal open and shows the error inside it when an action fails', () => {
      groups.update.and.returnValue(
        throwError(
          () => new HttpErrorResponse({ status: 409, error: { message: 'Nom déjà pris.' } }),
        ),
      );
      const { fixture, element } = renderGroup('owner');
      component = fixture.componentInstance;
      component.openDialog('rename');
      component.rename();
      fixture.detectChanges();

      expect(component.dialog()).toBe('rename');
      expect(element.querySelector('dialog .form-error')?.textContent).toContain('Nom déjà pris.');
      // The page-level error stays hidden behind an open modal.
      expect(element.querySelector('.groups-page > .form-error')).toBeNull();

      component.closeDialog();
      expect(component.submissionError()).toBe('');
    });

    it('lets a member leave through the danger modal', () => {
      const { fixture, element } = renderGroup('member');
      component = fixture.componentInstance;
      (element.querySelector('.group-tools button') as HTMLButtonElement).click();
      fixture.detectChanges();

      const dialog = element.querySelectorAll('app-modal-dialog');
      expect(dialog.length).toBe(1);
      expect(dialog[0].querySelector('h2')?.textContent).toBe('Quitter le groupe');

      (dialog[0].querySelector('.danger-button') as HTMLButtonElement).click();
      expect(groups.leave).toHaveBeenCalledTimes(1);
      expect(component.group()).toBeNull();
    });

    it('closes the modal from its cancel button', () => {
      const { fixture, element } = renderGroup('owner');
      component = fixture.componentInstance;
      component.openDialog('danger');
      fixture.detectChanges();

      (element.querySelectorAll('.dialog-actions .secondary-button')[1] as HTMLButtonElement).click();
      expect(component.dialog()).toBeNull();
      expect(groups.delete).not.toHaveBeenCalled();
    });
  });
});
