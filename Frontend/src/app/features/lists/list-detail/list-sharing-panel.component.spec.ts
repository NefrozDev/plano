import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListsStore } from '../lists.store';
import { ListSharingPanelComponent } from './list-sharing-panel.component';

describe('ListSharingPanelComponent', () => {
  let fixture: ComponentFixture<ListSharingPanelComponent>;
  let panel: ListSharingPanelComponent;
  let store: ListsStore;

  beforeEach(() => {
    fixture = TestBed.createComponent(ListSharingPanelComponent);
    fixture.componentRef.setInput('slug', 'courses');
    fixture.componentRef.setInput('listTitle', 'Courses');
    fixture.componentRef.setInput('color', '#2ecb70');
    panel = fixture.componentInstance;
    store = TestBed.inject(ListsStore);
    fixture.detectChanges();
  });

  it('lists the members with their role labels', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h3')?.textContent).toBe('Membres (3)');
    expect(element.querySelector('.owner-role')?.textContent).toBe('Propriétaire');
    expect(element.querySelector('.shared-list-summary small')?.textContent).toBe('Partagée');
  });

  it('invites a member, ignoring blank addresses, and closes the form', () => {
    panel.inviteFormOpen.set(true);
    panel.inviteEmail.set('  ');
    panel.invite();
    expect(panel.members().length).toBe(3);

    panel.inviteEmail.set('marie@example.com');
    panel.inviteRole.set('viewer');
    panel.invite();

    expect(store.detail('courses')?.members.at(-1)).toEqual(
      jasmine.objectContaining({ name: 'Marie', role: 'viewer' }),
    );
    expect(panel.inviteEmail()).toBe('');
    expect(panel.inviteFormOpen()).toBeFalse();
  });

  it('updates roles and toggles sharing through the store', () => {
    panel.updateRole('alex', 'viewer');
    expect(panel.members().find(({ id }) => id === 'alex')?.role).toBe('viewer');

    panel.setSharing(false);
    expect(panel.sharingEnabled()).toBeFalse();
    expect(panel.members().map(({ role }) => role)).toEqual(['owner']);

    panel.setSharing(true);
    expect(panel.sharingEnabled()).toBeTrue();
  });

  it('copies the invitation link', async () => {
    const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();

    await panel.copyInvitationLink();

    expect(writeText).toHaveBeenCalledWith('https://plano.app/l/courses-a1b2c3');
    expect(panel.linkCopied()).toBeTrue();
  });
});
