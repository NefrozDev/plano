import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import type { Contact, ObjectiveDetail } from '@plano/common';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { openObjective, provideObjectivesTesting, provideSignedIn, settleObjectives } from '../objectives.testing';
import { ME, OTHER, objectiveDetail, treeDetail } from '../testing/objectives-fixtures';
import { ObjectiveShareComponent } from './objective-share.component';

const OWNER = { id: ME, name: 'Ada Lovelace', role: 'owner', inheritedFrom: null } as const;
const BOB = { id: OTHER, name: 'Bob Martin', role: 'viewer', inheritedFrom: null } as const;
const shared = (changes: Partial<ObjectiveDetail> = {}): ObjectiveDetail =>
  objectiveDetail({ sharing: 'shared', members: [OWNER, BOB], ...changes });

function contact(id: string, firstName: string): Contact {
  return { id, username: firstName.toLowerCase(), firstName, lastName: '', avatarVersion: null, friend: true, groups: [] };
}

describe('ObjectiveShareComponent', () => {
  let fixture: ComponentFixture<ObjectiveShareComponent>;
  let component: ObjectiveShareComponent;
  let element: HTMLElement;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveShareComponent],
      providers: [
        ...provideObjectivesTesting(),
        provideSignedIn(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'obj-1' }) } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(): void {
    fixture = TestBed.createComponent(ObjectiveShareComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }
  async function show(detail: ObjectiveDetail): Promise<void> {
    await openObjective(detail);
    render();
  }
  const names = () => Array.from(element.querySelectorAll('.people .name')).map((node) => node.textContent?.trim());
  const answer = async (url: string, method: string, detail: ObjectiveDetail = shared()): Promise<unknown> => {
    const request = http.expectOne(`/api/v1/objectives/obj-1${url}`);
    expect(request.request.method).toBe(method);
    request.flush(detail);
    await settleObjectives();
    fixture.detectChanges();
    return request.request.body;
  };
  const openInvite = async (contacts: Contact[]): Promise<void> => {
    (element.querySelector('.link-button') as HTMLButtonElement).click();
    http.expectOne('/api/v1/contacts').flush(contacts);
    await settleObjectives();
    fixture.detectChanges();
  };

  it('loads the objective when it is not open yet', async () => {
    render();
    http.expectOne('/api/v1/objectives/obj-1').flush(shared());
    await settleObjectives();
    fixture.detectChanges();

    expect(names()).toEqual(['Ada Lovelace', 'Bob Martin']);
  });

  it('explains when the objective cannot be opened', async () => {
    render();
    http.expectOne('/api/v1/objectives/obj-1').flush(null, { status: 404, statusText: 'Not Found' });
    await settleObjectives();
    fixture.detectChanges();

    expect(element.querySelector('.empty')?.textContent).toContain('n’existe pas');
  });

  it('says that sub-objectives follow, only when there are some', async () => {
    await show(treeDetail());
    expect(element.querySelector('.note')?.textContent).toContain('aussi accès aux sous-objectifs');
  });

  describe('for the owner', () => {
    it('lists the people and what each can do', async () => {
      await show(shared());

      expect(names()).toEqual(['Ada Lovelace', 'Bob Martin']);
      expect(element.querySelector('h2')?.textContent).toBe('Personnes (2)');
      expect(element.querySelector('.people .role')?.textContent).toBe('Propriétaire');
      expect((element.querySelector('.people select') as HTMLSelectElement).value).toBe('viewer');
      expect(element.querySelector('.leave')).toBeNull();
    });

    it('changes a role', async () => {
      await show(shared());
      const select = element.querySelector('.people select') as HTMLSelectElement;

      select.value = 'contributor';
      select.dispatchEvent(new Event('change'));

      expect(await answer(`/members/${OTHER}`, 'PATCH')).toEqual({ role: 'contributor' });
    });

    it('removes someone', async () => {
      await show(shared());

      (element.querySelector('.remove') as HTMLButtonElement).click();

      await answer(`/members/${OTHER}`, 'DELETE', objectiveDetail());
      expect(names()).toEqual(['Ada Lovelace']);
    });

    it('cannot change someone invited higher up from here, and says where', async () => {
      await show(shared({ members: [OWNER, { ...BOB, inheritedFrom: { id: 'top', title: 'Haut' } }] }));

      expect(element.querySelector('.people select')).toBeNull();
      expect(element.querySelector('.remove')).toBeNull();
      expect(names()[1]).toContain('Invité·e sur « Haut »');
    });

    it('invites a contact as a viewer by default', async () => {
      await show(objectiveDetail());
      await openInvite([contact('c1', 'Cyd'), contact('c2', 'Dan')]);

      expect(Array.from(element.querySelectorAll('.invite select option')).map((option) => option.textContent)).toEqual([
        'Cyd',
        'Dan',
      ]);
      (element.querySelector('.invite .primary-button') as HTMLButtonElement).click();

      expect(await answer('/members', 'POST', shared())).toEqual({ userId: 'c1', role: 'viewer' });
      expect(element.querySelector('.invite')).toBeNull();
    });

    it('makes the objective common by choosing it', async () => {
      await show(objectiveDetail());
      await openInvite([contact('c1', 'Cyd'), contact('c2', 'Dan')]);

      const person = element.querySelector('.invite select') as HTMLSelectElement;
      person.value = 'c2';
      person.dispatchEvent(new Event('change'));
      element.querySelectorAll<HTMLInputElement>('.invite-roles input')[1].click();
      fixture.detectChanges();
      expect(element.querySelector('.invite-roles .selected')?.textContent).toContain('Objectif commun');
      (element.querySelector('.invite .primary-button') as HTMLButtonElement).click();

      expect(await answer('/members', 'POST', shared())).toEqual({ userId: 'c2', role: 'contributor' });
    });

    it('offers only contacts without access, plus those who only follow from higher up', async () => {
      await show(
        shared({
          members: [
            OWNER,
            { ...BOB, id: 'here' },
            { ...BOB, id: 'above', inheritedFrom: { id: 'top', title: 'Haut' } },
            { ...BOB, id: 'above-more', role: 'contributor', inheritedFrom: { id: 'top', title: 'Haut' } },
          ],
        }),
      );
      await openInvite([
        contact('here', 'Ici'),
        contact('above', 'Audessus'),
        contact('above-more', 'Contributeur'),
        contact('new', 'Nouveau'),
      ]);

      expect(component.candidates().map(({ id }) => id)).toEqual(['above', 'new']);
    });

    it('says when there is nobody left to invite', async () => {
      await show(shared());
      await openInvite([contact(OTHER, 'Bob')]);

      expect(element.querySelector('.invite')).toBeNull();
      expect(element.querySelector('.note')?.textContent).toContain('Tous vos contacts');
    });

    it('copes with contacts that cannot be loaded', async () => {
      await show(objectiveDetail());
      (element.querySelector('.link-button') as HTMLButtonElement).click();
      http.expectOne('/api/v1/contacts').flush(null, { status: 500, statusText: 'Error' });
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.note')?.textContent).toContain('Tous vos contacts');
    });

    it('shows that contacts are loading', async () => {
      await show(objectiveDetail());

      (element.querySelector('.link-button') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(element.querySelector('.note')?.textContent).toContain('Chargement');
      http.expectOne('/api/v1/contacts').flush([]);
      await settleObjectives();
    });

    it('keeps the form open and shows why when an invitation is refused', async () => {
      await show(objectiveDetail());
      await openInvite([contact('c1', 'Cyd')]);

      (element.querySelector('.invite .primary-button') as HTMLButtonElement).click();
      http.expectOne('/api/v1/objectives/obj-1/members').flush({ message: 'Déjà invité' }, { status: 409, statusText: 'Conflict' });
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.invite')).not.toBeNull();
      expect(element.querySelector('.field-error')?.textContent).toBe('Déjà invité');
    });

    it('sends nothing without someone to invite', async () => {
      await show(objectiveDetail());

      await component.invite();

      http.expectNone('/api/v1/objectives/obj-1/members');
      expect(component.store.error()).toBe('');
      expect(component.members().map(({ id }) => id)).toEqual([ME]);
    });
  });

  describe('for someone else', () => {
    const asBob = (changes: Partial<ObjectiveDetail> = {}) => shared({ role: 'viewer', ...changes });

    it('shows the people without any control', async () => {
      await show(asBob());

      expect(names()).toEqual(['Ada Lovelace', 'Bob Martin']);
      expect(element.querySelector('.people select')).toBeNull();
      expect(element.querySelector('.remove')).toBeNull();
      expect(element.querySelector('.link-button')).toBeNull();
      expect(element.querySelector('.people li:last-child .role')?.textContent).toBe('Peut consulter');
    });

    it('asks before leaving, then goes back to the overview', async () => {
      await show(asBob());
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await component.leave();
      http.expectNone('/api/v1/objectives/obj-1/members/me');
      expect(navigate).not.toHaveBeenCalled();

      confirm.mockResolvedValue(true);
      (element.querySelector('.leave') as HTMLButtonElement).click();
      await settleObjectives();
      const request = http.expectOne('/api/v1/objectives/obj-1/members/me');
      expect(request.request.method).toBe('DELETE');
      request.flush(null);
      await settleObjectives();

      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/objectives']);
    });

    it('stays when leaving fails', async () => {
      await show(asBob());
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      const leaving = component.leave();
      await settleObjectives();
      http.expectOne('/api/v1/objectives/obj-1/members/me').flush(null, { status: 500, statusText: 'Error' });
      await leaving;

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
