import type { Mock, MockedObject } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { GroupDetails } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { GroupSetupComponent } from './group-setup.component';

describe('GroupSetupComponent', () => {
  let groups: MockedObject<
    Pick<
      GroupsService,
      | 'getMine'
      | 'create'
      | 'join'
      | 'update'
      | 'rotateInviteCode'
      | 'transferOwnership'
      | 'removeMember'
      | 'leave'
      | 'delete'
    >
  >;
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
    groups = {
      getMine: vi.fn().mockName('GroupsService.getMine'),
      create: vi.fn().mockName('GroupsService.create'),
      join: vi.fn().mockName('GroupsService.join'),
      update: vi.fn().mockName('GroupsService.update'),
      rotateInviteCode: vi.fn().mockName('GroupsService.rotateInviteCode'),
      transferOwnership: vi.fn().mockName('GroupsService.transferOwnership'),
      removeMember: vi.fn().mockName('GroupsService.removeMember'),
      leave: vi.fn().mockName('GroupsService.leave'),
      delete: vi.fn().mockName('GroupsService.delete'),
    };
    groups.getMine.mockReturnValue(of(null));
    groups.create.mockReturnValue(of(group));
    groups.join.mockReturnValue(of({ ...group, role: 'member' }));
    groups.update.mockReturnValue(of(group));
    groups.rotateInviteCode.mockReturnValue(of(group));
    groups.transferOwnership.mockReturnValue(of({ ...group, role: 'member' }));
    groups.removeMember.mockReturnValue(of(undefined));
    groups.leave.mockReturnValue(of(undefined));
    groups.delete.mockReturnValue(of(undefined));

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
    groups.getMine.mockReturnValue(of(group));
    component.ngOnInit();

    expect(groups.getMine).toHaveBeenCalledTimes(1);
    expect(component.group()).toEqual(group);
    expect(component.renameForm.controls.name.value).toBe('Les Explorateurs');
    expect(component.loading()).toBe(false);
  });

  it('opens, closes, and validates the create form', () => {
    component.openCreateForm();
    expect(component.showCreateForm()).toBe(true);
    component.form.controls.name.setValue(' ');
    component.submit();
    expect(groups.create).not.toHaveBeenCalled();
    component.closeCreateForm();
    expect(component.showCreateForm()).toBe(false);
  });

  it('trims, creates, and navigates home', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.form.controls.name.setValue('  Les Explorateurs  ');
    component.submit();

    expect(groups.create).toHaveBeenCalledTimes(1);

    expect(groups.create).toHaveBeenCalledWith({
      name: 'Les Explorateurs',
    });
    expect(component.group()).toEqual(group);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('normalizes and accepts an invitation code', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.showJoinInfo();
    component.joinForm.controls.inviteCode.setValue('abcd1234');
    component.join();

    expect(groups.join).toHaveBeenCalledTimes(1);

    expect(groups.join).toHaveBeenCalledWith({ inviteCode: 'ABCD1234' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('renames the group and surfaces backend errors', () => {
    component.group.set(group);
    component.renameForm.controls.name.setValue('  Nouveau nom  ');
    component.rename();
    expect(groups.update).toHaveBeenCalledTimes(1);
    expect(groups.update).toHaveBeenCalledWith('Nouveau nom');
    expect(component.actionMessage()).toContain('modifié');

    groups.update.mockReturnValue(
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
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    groups.getMine.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.loadGroup();
    expect(component.submissionError()).toContain('Impossible de joindre');
    component.skip();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
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
    let confirm: Mock;

    beforeEach(() => {
      component.group.set({ ...group, members: [...group.members, member] });
      confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    });

    it('does nothing when the user cancels a confirmation', async () => {
      confirm.mockResolvedValue(false);
      await component.rotateInviteCode();
      await component.transferOwnership(member);
      await component.removeMember(member);

      expect(groups.rotateInviteCode).not.toHaveBeenCalled();
      expect(groups.transferOwnership).not.toHaveBeenCalled();
      expect(groups.removeMember).not.toHaveBeenCalled();
    });

    it('rotates the invite code and transfers ownership', async () => {
      await component.rotateInviteCode();
      expect(groups.rotateInviteCode).toHaveBeenCalledTimes(1);
      expect(component.group()?.inviteCode).toBe(group.inviteCode);
      expect(component.actionMessage()).toBe('Nouveau code généré.');

      await component.transferOwnership(member);
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Grace Hopper deviendra propriétaire du groupe.' }),
      );
      expect(groups.transferOwnership).toHaveBeenCalledTimes(1);
      expect(groups.transferOwnership).toHaveBeenCalledWith('user-2');
      // One confirmation per sensitive action.
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(component.isOwner()).toBe(false);
      expect(component.busyAction()).toBe('');
    });

    it('removes a member locally once the server confirms', async () => {
      await component.removeMember(member);

      expect(groups.removeMember).toHaveBeenCalledTimes(1);

      expect(groups.removeMember).toHaveBeenCalledWith('user-2');
      expect(component.group()?.members.map(({ id }) => id)).toEqual(['user-1']);
      expect(component.actionMessage()).toBe('Membre retiré du groupe.');
    });

    it('keeps the member and reports the error when removal fails', async () => {
      groups.removeMember.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { message: ['Membre inconnu.', 'Réessayez.'] },
            }),
        ),
      );
      await component.removeMember(member);

      expect(groups.removeMember).toHaveBeenCalledTimes(1);
      expect(groups.removeMember).toHaveBeenCalledWith('user-2');
      // Validation errors arrive as an array of messages.
      expect(component.submissionError()).toBe('Membre inconnu. Réessayez.');
      expect(component.group()?.members.length).toBe(2);
    });

    it('handles a removal finishing after the group disappeared', async () => {
      groups.removeMember.mockImplementation(() => {
        component.group.set(null);
        return of(undefined);
      });
      await component.removeMember(member);

      expect(groups.removeMember).toHaveBeenCalledTimes(1);
      expect(component.group()).toBeNull();
      expect(component.busyAction()).toBe('');
    });

    it('leaves or deletes the group and clears it', () => {
      component.leaveGroup();
      expect(groups.leave).toHaveBeenCalledTimes(1);
      expect(groups.delete).not.toHaveBeenCalled();
      expect(component.group()).toBeNull();
      expect(component.actionMessage()).toBe('Vous avez quitté le groupe.');

      component.group.set(group);
      component.openDialog('danger');
      component.deleteGroup();
      expect(groups.delete).toHaveBeenCalledTimes(1);
      expect(groups.leave).toHaveBeenCalledTimes(1);
      // The modal is the confirmation step: no extra browser prompt.
      expect(confirm).not.toHaveBeenCalled();
      expect(component.dialog()).toBeNull();
      expect(component.actionMessage()).toBe('Le groupe a été supprimé.');
    });

    it('uses a generic message for unexpected failures', () => {
      groups.delete.mockReturnValue(throwError(() => new Error('boom')));
      component.deleteGroup();

      expect(groups.delete).toHaveBeenCalledTimes(1);
      expect(component.actionMessage()).toBe('');

      expect(component.submissionError()).toBe(
        'L’action a échoué. Veuillez réessayer.',
      );
      expect(component.group()).not.toBeNull();
    });
  });

  describe('invite code', () => {
    it('copies the code and resets the confirmation after a delay', async () => {
      vi.useFakeTimers();
      try {
        const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
        component.group.set(group);

        await component.copyInviteCode();
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText).toHaveBeenCalledWith('ABC12345');
        expect(component.linkCopied()).toBe(true);

        vi.advanceTimersByTime(1799);
        expect(component.linkCopied()).toBe(true);
        vi.advanceTimersByTime(1);
        expect(component.linkCopied()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows the code when the clipboard is unavailable', async () => {
      const writeText = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockRejectedValue(new Error('denied'));
      component.group.set(group);

      await component.copyInviteCode();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith('ABC12345');
      expect(component.linkCopied()).toBe(false);

      expect(component.actionMessage()).toBe('Code d’invitation : ABC12345');
    });

    it('ignores copy requests without a group', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
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
      groups.create.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, error: null })),
      );
      const navigate = vi.spyOn(router, 'navigateByUrl');
      component.form.controls.name.setValue('Valide');
      component.submit();

      expect(groups.create).toHaveBeenCalledTimes(1);
      expect(groups.create).toHaveBeenCalledWith({ name: 'Valide' });
      expect(navigate).not.toHaveBeenCalled();
      expect(component.submissionError()).toBe('L’action a échoué. Veuillez réessayer.');
      expect(component.submitting()).toBe(false);
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
    groups.getMine.mockReturnValue(of(group));
    const fixture = TestBed.createComponent(GroupSetupComponent);
    fixture.detectChanges();

    expect(groups.getMine).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Les Explorateurs');
    expect(fixture.componentInstance.isOwner()).toBe(true);
  });

  it('goes back home from the back bubble of the management view', () => {
    groups.getMine.mockReturnValue(of(group));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(GroupSetupComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const back = element.querySelector('.back-bubble') as HTMLButtonElement;

    expect(back.getAttribute('aria-label')).toBe('Retour à l’accueil');
    expect(element.textContent).not.toContain('Retour à l’accueil');

    back.click();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
  });
  describe('management modals', () => {
    function renderGroup(role: 'owner' | 'member') {
      groups.getMine.mockReturnValue(of({ ...group, role }));
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
      const dialog = element.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
      expect(component.renameForm.controls.name.value).toBe('Les Explorateurs');

      component.renameForm.controls.name.setValue('Les Aventuriers');
      (dialog.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      expect(groups.update).toHaveBeenCalledTimes(1);

      expect(groups.update).toHaveBeenCalledWith('Les Aventuriers');
      expect(component.dialog()).toBeNull();
      expect(dialog.open).toBe(false);
    });

    it('confirms a rename with a floating toast instead of an inline message', () => {
      const { fixture, element } = renderGroup('owner');
      component = fixture.componentInstance;
      component.openDialog('rename');
      component.renameForm.controls.name.setValue('Les Aventuriers');
      component.rename();
      fixture.detectChanges();

      expect(groups.update).toHaveBeenCalledTimes(1);
      expect(groups.update).toHaveBeenCalledWith('Les Aventuriers');
      expect(component.dialog()).toBeNull();
      expect(element.querySelector('app-toast .toast')?.textContent).toContain('Nom modifié.');
      expect(element.querySelector('.success-message')).toBeNull();
      // Projected into the frame's sticky overlay strip, outside the page flow.
      expect(element.querySelector('.overlay-anchor app-toast')).not.toBeNull();

      (element.querySelector('app-toast .toast') as HTMLButtonElement).click();
      expect(component.actionMessage()).toBe('');
    });

    it('keeps the modal open and shows the error inside it when an action fails', () => {
      groups.update.mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 409, error: { message: 'Nom déjà pris.' } }),
        ),
      );
      const { fixture, element } = renderGroup('owner');
      component = fixture.componentInstance;
      component.openDialog('rename');
      component.rename();
      fixture.detectChanges();

      // The modal starts from the current name, which is what gets submitted.
      expect(groups.update).toHaveBeenCalledTimes(1);
      expect(groups.update).toHaveBeenCalledWith('Les Explorateurs');
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
      expect(groups.delete).not.toHaveBeenCalled();
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
