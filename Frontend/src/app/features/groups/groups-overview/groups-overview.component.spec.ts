import type { MockedObject } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GroupDetails } from '../../../core/groups/group.models';
import { GroupsService } from '../../../core/groups/groups.service';
import { GroupsOverviewComponent } from './groups-overview.component';

describe('GroupsOverviewComponent', () => {
  let groups: MockedObject<Pick<GroupsService, 'getAll' | 'create' | 'join'>>;
  let fixture: ComponentFixture<GroupsOverviewComponent>;
  let component: GroupsOverviewComponent;
  let element: HTMLElement;
  let router: Router;
  const member = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    role: 'owner' as const,
    joinedAt: '2030-01-01T00:00:00Z',
  };
  const family: GroupDetails = {
    id: 'group-1',
    name: 'Famille proche',
    inviteCode: 'ABC12345',
    role: 'owner',
    createdAt: '2030-01-01T00:00:00Z',
    members: [member],
  };
  const work: GroupDetails = {
    ...family,
    id: 'group-2',
    name: 'Travail',
    role: 'member',
    members: [member, { ...member, id: 'user-2', role: 'owner' }],
  };

  function render(mine: GroupDetails[]): void {
    groups.getAll.mockReturnValue(of(mine));
    fixture = TestBed.createComponent(GroupsOverviewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    groups = {
      getAll: vi.fn().mockName('GroupsService.getAll'),
      create: vi.fn().mockName('GroupsService.create'),
      join: vi.fn().mockName('GroupsService.join'),
    };
    groups.create.mockReturnValue(of(family));
    groups.join.mockReturnValue(of(work));
    await TestBed.configureTestingModule({
      imports: [GroupsOverviewComponent],
      providers: [provideRouter([]), { provide: GroupsService, useValue: groups }],
    }).compileComponents();
    router = TestBed.inject(Router);
  });

  it('lists every group of the user, linked to its page, and still offers to create or join', () => {
    render([family, work]);

    expect(groups.getAll).toHaveBeenCalledTimes(1);
    expect(element.querySelector('h2')?.textContent).toBe('Mes groupes');
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('.group-link'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/groups/group-1', '/groups/group-2']);
    expect(links.map((link) => link.querySelector('small')?.textContent)).toEqual(['1 membre', '2 membres']);
    expect(links.map((link) => link.querySelector('.role-pill')?.textContent)).toEqual(['Propriétaire', 'Membre']);
    expect(element.querySelectorAll('.setup-card').length).toBe(2);
    // With groups, the way out is the back bubble, not the onboarding skip.
    expect(element.querySelector('.back-bubble')?.getAttribute('aria-label')).toBe('Retour à l’accueil');
    expect(element.querySelector('.back-button')).toBeNull();
  });

  it('works as the onboarding step without any group', () => {
    render([]);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    expect(element.querySelector('h2')?.textContent).toBe('Configurez votre groupe');
    expect(element.querySelector('.group-list')).toBeNull();
    expect(element.querySelector('.back-bubble')).toBeNull();

    (element.querySelector('.back-button') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('trims the name, creates another group and opens it', () => {
    render([work]);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.openCreateForm();
    expect(component.showCreateForm()).toBe(true);
    component.form.controls.name.setValue('  Famille proche  ');
    component.submit();

    expect(groups.create).toHaveBeenCalledTimes(1);
    expect(groups.create).toHaveBeenCalledWith({ name: 'Famille proche' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/groups', 'group-1']);
    expect(component.busyAction()).toBe('');
  });

  it('validates the create form before sending anything', () => {
    render([]);
    component.openCreateForm();
    component.form.controls.name.setValue(' ');
    component.submit();
    fixture.detectChanges();

    expect(groups.create).not.toHaveBeenCalled();
    expect(element.querySelector('.field-error')?.textContent).toContain('entre 2 et 80');
    component.closeCreateForm();
    expect(component.showCreateForm()).toBe(false);
  });

  it('normalizes an invitation code, joins and opens the group', () => {
    render([family]);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.showJoinInfo();
    component.joinForm.controls.inviteCode.setValue(' abcd1234 ');
    component.join();

    expect(groups.join).toHaveBeenCalledTimes(1);
    expect(groups.join).toHaveBeenCalledWith({ inviteCode: 'ABCD1234' });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/groups', 'group-2']);
  });

  it('rejects malformed invite codes', () => {
    render([]);
    component.showJoinInfo();
    component.joinForm.controls.inviteCode.setValue(' abc ');
    component.join();

    expect(groups.join).not.toHaveBeenCalled();
    expect(component.joinForm.controls.inviteCode.value).toBe('ABC');
    component.closeJoinForm();
    expect(component.mode()).toBe('choice');
  });

  it('reports a code for a group the user is already in, and stays on the page', () => {
    render([family]);
    const navigate = vi.spyOn(router, 'navigate');
    groups.join.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Vous faites déjà partie de ce groupe.' } })),
    );
    component.joinForm.controls.inviteCode.setValue('ABC12345');
    component.join();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('.form-error')?.textContent).toContain('Vous faites déjà partie de ce groupe.');
  });

  it('ignores submissions while another action is running', () => {
    render([]);
    component.busyAction.set('join');
    component.form.controls.name.setValue('Valide');
    component.submit();
    component.joinForm.controls.inviteCode.setValue('ABCD1234');
    component.join();

    expect(groups.create).not.toHaveBeenCalled();
    expect(groups.join).not.toHaveBeenCalled();
  });

  it('reports load failures and backend errors without a usable message', () => {
    groups.getAll.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    fixture = TestBed.createComponent(GroupsOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component.submissionError()).toContain('Impossible de joindre');
    expect(component.loading()).toBe(false);

    groups.create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error: null })));
    const navigate = vi.spyOn(router, 'navigate');
    component.form.controls.name.setValue('Valide');
    component.submit();

    expect(groups.create).toHaveBeenCalledWith({ name: 'Valide' });
    expect(navigate).not.toHaveBeenCalled();
    expect(component.submissionError()).toBe('L’action a échoué. Veuillez réessayer.');
    expect(component.submitting()).toBe(false);
  });
});
