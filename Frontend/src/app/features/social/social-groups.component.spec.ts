import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { GroupDetails } from '../../core/groups/group.models';
import { providePlanoTesting } from '../../testing/plano-testing';
import { SocialGroupsComponent } from './social-groups.component';

describe('SocialGroupsComponent', () => {
  let fixture: ComponentFixture<SocialGroupsComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;

  const member = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    role: 'owner' as const,
    joinedAt: '2030-01-01T00:00:00Z',
    avatarVersion: null,
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

  const groupsRequest = () => http.expectOne({ method: 'GET', url: '/api/v1/groups' });
  const rows = () => Array.from(element.querySelectorAll<HTMLAnchorElement>('a.group'));
  const manage = () => element.querySelector('a.manage') as HTMLAnchorElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SocialGroupsComponent], providers: providePlanoTesting() });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SocialGroupsComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('says it is loading until the API answers', () => {
    expect(element.querySelector('[role="status"]')?.textContent).toBe('Chargement de vos groupes…');
    expect(rows()).toEqual([]);

    groupsRequest().flush([family]);
    fixture.detectChanges();

    expect(element.querySelector('[role="status"]')).toBeNull();
    expect(rows()).toHaveLength(1);
  });

  it('lists the user’s groups with their size and role, each opening its page', () => {
    groupsRequest().flush([family, work]);
    fixture.detectChanges();

    expect(element.querySelector('h2')?.textContent).toBe('Groupes');
    expect(
      rows().map((row) => [
        row.getAttribute('href'),
        row.querySelector('strong')?.textContent,
        row.querySelector('small')?.textContent,
        row.querySelector('.role')?.textContent,
      ]),
    ).toEqual([
      ['/groups/group-1', 'Famille proche', '1 membre', 'Propriétaire'],
      ['/groups/group-2', 'Travail', '2 membres', 'Membre'],
    ]);
    // Creating or joining a group stays one tap away.
    expect(manage().getAttribute('href')).toBe('/groups');
    expect(manage().textContent).toBe('Créer ou rejoindre un groupe');
  });

  it('says so when the user is in no group, and still offers to create or join one', () => {
    groupsRequest().flush([]);
    fixture.detectChanges();

    expect(rows()).toEqual([]);
    expect(element.querySelector('.note')?.textContent).toBe('Vous ne faites partie d’aucun groupe pour l’instant.');
    expect(manage().getAttribute('href')).toBe('/groups');
  });

  it('explains a failed load and loads again on request, once', () => {
    groupsRequest().flush(null, { status: 500, statusText: 'Error' });
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toBe('Vos groupes n’ont pas pu être chargés.');
    expect(rows()).toEqual([]);

    (element.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    groupsRequest().flush([work]);
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(rows().map((row) => row.querySelector('strong')?.textContent)).toEqual(['Travail']);
  });
});
