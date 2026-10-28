import type { Mock, MockedObject } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { GroupDetails } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { GroupDetailComponent } from './group-detail.component';

describe('GroupDetailComponent', () => {
  let groups: MockedObject<
    Pick<
      GroupsService,
      | 'get'
      | 'update'
      | 'rotateInviteCode'
      | 'transferOwnership'
      | 'removeMember'
      | 'leave'
      | 'delete'
    >
  >;
  let component: GroupDetailComponent;
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
      get: vi.fn().mockName('GroupsService.get'),
      update: vi.fn().mockName('GroupsService.update'),
      rotateInviteCode: vi.fn().mockName('GroupsService.rotateInviteCode'),
      transferOwnership: vi.fn().mockName('GroupsService.transferOwnership'),
      removeMember: vi.fn().mockName('GroupsService.removeMember'),
      leave: vi.fn().mockName('GroupsService.leave'),
      delete: vi.fn().mockName('GroupsService.delete'),
    };
    groups.get.mockReturnValue(of(group));
    groups.update.mockReturnValue(of(group));
    groups.rotateInviteCode.mockReturnValue(of(group));
    groups.transferOwnership.mockReturnValue(of({ ...group, role: 'member' }));
    groups.removeMember.mockReturnValue(of(undefined));
    groups.leave.mockReturnValue(of(undefined));
    groups.delete.mockReturnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ groupId: 'group-1' }) } },
        },
        { provide: GroupsService, useValue: groups },
        { provide: AuthService, useValue: { user: () => ({ id: 'user-1' }) } },
      ],
    }).compileComponents();
    component = TestBed.createComponent(GroupDetailComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  it('loads the group of the route and prepares its editable name', () => {
    component.ngOnInit();

    expect(groups.get).toHaveBeenCalledTimes(1);
    expect(groups.get).toHaveBeenCalledWith('group-1');
    expect(component.group()).toEqual(group);
    expect(component.renameForm.controls.name.value).toBe('Les Explorateurs');
    expect(component.loading()).toBe(false);
  });

  it('renames the group and surfaces backend errors', () => {
    component.group.set(group);
    component.renameForm.controls.name.setValue('  Nouveau nom  ');
    component.rename();
    expect(groups.update).toHaveBeenCalledTimes(1);
    expect(groups.update).toHaveBeenCalledWith('group-1', 'Nouveau nom');
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

  it('goes back to the groups and maps offline failures', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    groups.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.loadGroup();
    expect(component.submissionError()).toContain('Impossible de joindre');
    expect(component.group()).toBeNull();
    component.back();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/groups');
  });

  it('explains when the group is not one of the user’s', () => {
    groups.get.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, error: { message: 'Ce groupe est introuvable.' } })),
    );
    const fixture = TestBed.createComponent(GroupDetailComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.form-error')?.textContent).toContain('Ce groupe est introuvable.');
    expect(element.querySelector('a.back-button')?.getAttribute('href')).toBe('/groups');
    expect(element.querySelector('.group-tools')).toBeNull();
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
      expect(groups.rotateInviteCode).toHaveBeenCalledWith('group-1');
      expect(component.group()?.inviteCode).toBe(group.inviteCode);
      expect(component.actionMessage()).toBe('Nouveau code généré.');

      await component.transferOwnership(member);
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Grace Hopper deviendra propriétaire du groupe.' }),
      );
      expect(groups.transferOwnership).toHaveBeenCalledTimes(1);
      expect(groups.transferOwnership).toHaveBeenCalledWith('group-1', 'user-2');
      // One confirmation per sensitive action.
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(component.isOwner()).toBe(false);
      expect(component.busyAction()).toBe('');
    });

    it('removes a member locally once the server confirms', async () => {
      await component.removeMember(member);

      expect(groups.removeMember).toHaveBeenCalledTimes(1);

      expect(groups.removeMember).toHaveBeenCalledWith('group-1', 'user-2');
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
      expect(groups.removeMember).toHaveBeenCalledWith('group-1', 'user-2');
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

    it('leaves or deletes the group, then returns to the groups', () => {
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      component.leaveGroup();
      expect(groups.leave).toHaveBeenCalledTimes(1);
      expect(groups.leave).toHaveBeenCalledWith('group-1');
      expect(groups.delete).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenLastCalledWith('/groups');

      component.openDialog('danger');
      component.deleteGroup();
      expect(groups.delete).toHaveBeenCalledTimes(1);
      expect(groups.delete).toHaveBeenCalledWith('group-1');
      expect(groups.leave).toHaveBeenCalledTimes(1);
      // The modal is the confirmation step: no extra browser prompt.
      expect(confirm).not.toHaveBeenCalled();
      expect(component.dialog()).toBeNull();
      expect(navigate).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenLastCalledWith('/groups');
    });

    it('uses a generic message for unexpected failures', () => {
      const navigate = vi.spyOn(router, 'navigateByUrl');
      groups.delete.mockReturnValue(throwError(() => new Error('boom')));
      component.deleteGroup();
      expect(navigate).not.toHaveBeenCalled();

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

  it('ignores a rename while another action is running', () => {
    component.busyAction.set('rotate');
    component.renameForm.controls.name.setValue('Valide');
    component.rename();

    expect(groups.update).not.toHaveBeenCalled();
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
    const fixture = TestBed.createComponent(GroupDetailComponent);
    fixture.detectChanges();

    expect(groups.get).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Les Explorateurs');
    expect(fixture.componentInstance.isOwner()).toBe(true);
  });

  it('goes back to the groups from the back bubble', () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(GroupDetailComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const back = element.querySelector('.back-bubble') as HTMLButtonElement;

    expect(back.getAttribute('aria-label')).toBe('Retour à mes groupes');

    back.click();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/groups');
  });
  describe('management modals', () => {
    function renderGroup(role: 'owner' | 'member') {
      groups.get.mockReturnValue(of({ ...group, role }));
      const fixture = TestBed.createComponent(GroupDetailComponent);
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

      expect(groups.update).toHaveBeenCalledWith('group-1', 'Les Aventuriers');
      expect(component.dialog()).toBeNull();
      expect(dialog.open).toBe(false);
    });

    it('puts focus in the name field when the rename modal opens', async () => {
      const { fixture, element } = renderGroup('owner');

      (element.querySelector('.group-tools button') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(document.activeElement).toBe(element.querySelector('dialog input[formControlName="name"]'));
    });

    it('confirms a rename with a floating toast instead of an inline message', () => {
      const { fixture, element } = renderGroup('owner');
      component = fixture.componentInstance;
      component.openDialog('rename');
      component.renameForm.controls.name.setValue('Les Aventuriers');
      component.rename();
      fixture.detectChanges();

      expect(groups.update).toHaveBeenCalledTimes(1);
      expect(groups.update).toHaveBeenCalledWith('group-1', 'Les Aventuriers');
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
      expect(groups.update).toHaveBeenCalledWith('group-1', 'Les Explorateurs');
      expect(component.dialog()).toBe('rename');
      expect(element.querySelector('dialog .form-error')?.textContent).toContain('Nom déjà pris.');
      // The page-level error stays hidden behind an open modal.
      expect(element.querySelector('.groups-page > .form-error')).toBeNull();

      component.closeDialog();
      expect(component.submissionError()).toBe('');
    });

    it('lets a member leave through the danger modal', () => {
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      const { fixture, element } = renderGroup('member');
      component = fixture.componentInstance;
      (element.querySelector('.group-tools button') as HTMLButtonElement).click();
      fixture.detectChanges();

      const dialog = element.querySelectorAll('app-modal-dialog');
      expect(dialog.length).toBe(1);
      expect(dialog[0].querySelector('h2')?.textContent).toBe('Quitter le groupe');

      (dialog[0].querySelector('.danger-button') as HTMLButtonElement).click();
      expect(groups.leave).toHaveBeenCalledTimes(1);
      expect(groups.leave).toHaveBeenCalledWith('group-1');
      expect(groups.delete).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith('/groups');
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
