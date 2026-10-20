import { signal } from '@angular/core';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ListDetail } from '@plano/common';
import type { AuthUser } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { providePlanoTesting, settle } from '../../../testing/plano-testing';
import { ListsStore } from '../lists.store';
import { MEMBER_ID, OWNER_ID, listDetail, listSettings } from '../testing/lists-fixtures';
import { ListSharingPanelComponent } from './list-sharing-panel.component';

describe('ListSharingPanelComponent', () => {
  let fixture: ComponentFixture<ListSharingPanelComponent>;
  let panel: ListSharingPanelComponent;
  let element: HTMLElement;
  let http: HttpTestingController;
  let store: ListsStore;

  /** Opens `list` in the store, as the detail screen would, and shows the panel for it. */
  async function create(list: ListDetail, currentUserId = OWNER_ID): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        providePlanoTesting(),
        { provide: AuthService, useValue: { user: signal({ id: currentUserId } as AuthUser) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ListsStore);
    const opening = store.open(list.id);
    http.expectOne(`/api/v1/lists/${list.id}`).flush(list);
    http.expectOne('/api/v1/settings/lists').flush(listSettings());
    await opening;

    fixture = TestBed.createComponent(ListSharingPanelComponent);
    fixture.componentRef.setInput('list', list);
    panel = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('lets the owner invite group mates who cannot see the list yet', async () => {
    await create(listDetail());

    panel.openInviteForm();
    http.expectOne('/api/v1/groups/me').flush({
      members: [
        { id: OWNER_ID, firstName: 'Ada', lastName: 'Lovelace', username: 'ada' },
        { id: MEMBER_ID, firstName: 'Bob', lastName: 'Martin', username: 'bob' },
        { id: 'user-cyd', firstName: 'Cyd', lastName: 'Charisse', username: 'cyd' },
      ],
    });
    fixture.detectChanges();

    expect(panel.candidates().map(({ id }) => id)).toEqual(['user-cyd']);
    expect(panel.inviteUserId()).toBe('user-cyd');

    panel.inviteRole.set('viewer');
    const inviting = panel.invite();
    const request = http.expectOne('/api/v1/lists/list-1/members');
    expect(request.request.body).toEqual({ userId: 'user-cyd', role: 'viewer' });
    request.flush({ id: 'user-cyd', name: 'Cyd Charisse', role: 'viewer' });
    await inviting;

    expect(panel.inviteFormOpen()).toBe(false);
    expect(store.detail()?.members.length).toBe(3);
  });

  it('explains when every group mate already has access', async () => {
    await create(listDetail());

    panel.openInviteForm();
    http.expectOne('/api/v1/groups/me').flush({ members: [{ id: MEMBER_ID }] });
    fixture.detectChanges();

    expect(element.querySelector('.sharing-hint')?.textContent).toContain('déjà accès');
  });

  it('changes roles, removes members and stops sharing for the owner', async () => {
    await create(listDetail());
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

    panel.updateRole(MEMBER_ID, 'viewer');
    http
      .expectOne(`/api/v1/lists/list-1/members/${MEMBER_ID}`)
      .flush({ id: MEMBER_ID, name: 'Bob Martin', role: 'viewer' });
    panel.removeMember(MEMBER_ID);
    http.expectOne({ method: 'DELETE', url: `/api/v1/lists/list-1/members/${MEMBER_ID}` }).flush(null);

    const stopping = panel.stopSharing();
    await settle();
    http.expectOne({ method: 'DELETE', url: '/api/v1/lists/list-1/members' }).flush(null);
    await stopping;
    expect(store.detail()?.members.map(({ role }) => role)).toEqual(['owner']);
  });

  it('shows members read-only to others and lets them leave', async () => {
    await create(listDetail({ role: 'editor', ownership: 'shared' }), MEMBER_ID);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

    expect(element.querySelector('.sharing-member select')).toBeNull();
    expect(element.querySelector('.invite-people')).toBeNull();

    const leaving = panel.leave();
    await settle();
    http.expectOne({ method: 'DELETE', url: `/api/v1/lists/list-1/members/${MEMBER_ID}` }).flush(null);
    await leaving;
    expect(navigate).toHaveBeenCalledWith('/lists');
  });
});
