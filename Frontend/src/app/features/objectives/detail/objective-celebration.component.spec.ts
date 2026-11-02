import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ObjectiveDetail } from '@plano/common';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { FakeEventSource } from '../../../testing/fake-event-source';
import { ObjectivesStore } from '../objectives.store';
import { openObjective, provideObjectivesTesting, provideSignedIn, settleObjectives } from '../objectives.testing';
import { objectiveDetail } from '../testing/objectives-fixtures';
import { ObjectiveCelebrationComponent } from './objective-celebration.component';

describe('ObjectiveCelebrationComponent', () => {
  let fixture: ComponentFixture<ObjectiveCelebrationComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let store: ObjectivesStore;
  let navigate: ReturnType<typeof vi.spyOn>;

  const active = (changes: Partial<ObjectiveDetail> = {}) =>
    objectiveDetail({ completion: 'manual', status: 'active', percent: 80, ...changes });
  const done = (changes: Partial<ObjectiveDetail> = {}) =>
    active({ status: 'completed', percent: 100, completedAt: '2026-10-15T08:00:00.000Z', ...changes });
  const dialog = () => element.querySelector('dialog');
  const choices = () => Array.from(element.querySelectorAll('.choice strong'), (choice) => choice.textContent);
  const choice = (label: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('.choice')).find((button) => button.textContent?.includes(label))!;

  /** Opens the objective, then completes it the way the user would: through the API. */
  async function complete(before: ObjectiveDetail, after: ObjectiveDetail): Promise<void> {
    await openObjective(before);
    const saving = store.setProgress(before.id, 100);
    http.expectOne(`/api/v1/objectives/${before.id}/progress`).flush(after);
    await saving;
    fixture.detectChanges();
  }

  beforeEach(() => {
    FakeEventSource.created = [];
    TestBed.configureTestingModule({
      imports: [ObjectiveCelebrationComponent],
      providers: [...provideObjectivesTesting(), provideSignedIn()],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ObjectivesStore);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ObjectiveCelebrationComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    // The signed-in user's notifications load with the app.
    for (const request of http.match('/api/v1/notifications')) request.flush({ items: [], unread: { friends: 0, lists: 0, objectives: 0, agenda: 0 } });
  });

  it('stays hidden until the open objective becomes complete', async () => {
    await openObjective(done());
    fixture.detectChanges();
    expect(dialog()).toBeNull();

    await openObjective(active({ id: 'obj-2' }));
    const saving = store.setProgress('obj-2', 90);
    http.expectOne('/api/v1/objectives/obj-2/progress').flush(active({ id: 'obj-2', percent: 90 }));
    await saving;
    fixture.detectChanges();
    expect(dialog()).toBeNull();
  });

  it('celebrates, and offers the owner to start again, archive or delete', async () => {
    await complete(active(), done());

    expect(dialog()?.open).toBe(true);
    expect(element.querySelector('h2')?.textContent).toBe('Objectif atteint !');
    expect(element.querySelector('.message')?.textContent).toBe('Bravo, « Courir 10 km » est terminé !');
    expect(choices()).toEqual(['Recommencer', 'Archiver', 'Supprimer']);
    expect(element.querySelectorAll('.confetti i').length).toBeGreaterThan(10);
    // Enter keeps it as it is: nothing is deleted by accident.
    expect(document.activeElement).toBe(element.querySelector('.later'));
  });

  it('does not offer to start a sub-objective again', async () => {
    await complete(active({ parentId: 'parent' }), done({ parentId: 'parent' }));

    expect(choices()).toEqual(['Archiver', 'Supprimer']);
  });

  it('only cheers with someone who is not the owner', async () => {
    await complete(active({ role: 'contributor' }), done({ role: 'contributor' }));

    expect(choices()).toEqual([]);
    (element.querySelector('.later') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.celebration()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('starts it again from today', async () => {
    await complete(active(), done());

    choice('Recommencer').click();
    fixture.detectChanges();
    const request = http.expectOne({ method: 'POST', url: '/api/v1/objectives/obj-1/restart' });
    request.flush(active({ percent: 0 }));
    await settleObjectives();
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    expect(store.detail()?.percent).toBe(0);
    // Starting again is not completing: no new celebration.
    expect(store.celebration()).toBeNull();
  });

  it('archives it', async () => {
    await complete(active(), done());

    choice('Archiver').click();
    const request = http.expectOne({ method: 'PATCH', url: '/api/v1/objectives/obj-1' });
    expect(request.request.body).toEqual({ archived: true });
    request.flush(done({ archived: true }));
    await settleObjectives();
    fixture.detectChanges();
    expect(dialog()).toBeNull();
  });

  it('deletes it once confirmed, then leaves its page', async () => {
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    await complete(active(), done());

    choice('Supprimer').click();
    await settleObjectives();
    http.expectOne({ method: 'DELETE', url: '/api/v1/objectives/obj-1' }).flush(null);
    await settleObjectives();

    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/objectives']);
  });

  it('keeps it as it is', async () => {
    await complete(active(), done());

    (element.querySelector('.later') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dialog()).toBeNull();
    http.expectNone((req) => req.method !== 'GET');
    expect(store.detail()?.status).toBe('completed');
  });

  it('also celebrates when someone else completes it while it is open', async () => {
    await openObjective(active());

    FakeEventSource.latest()?.emit({ type: 'objective.changed', objectiveId: 'obj-1' });
    http.expectOne('/api/v1/objectives/obj-1').flush(done());
    await settleObjectives();
    fixture.detectChanges();

    expect(store.celebration()?.id).toBe('obj-1');
    expect(dialog()?.open).toBe(true);
  });
});
