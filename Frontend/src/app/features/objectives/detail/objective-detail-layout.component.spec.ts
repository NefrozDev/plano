import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { FakeEventSource } from '../../../testing/fake-event-source';
import { OBJECTIVES_ROUTES } from '../objectives.routes';
import { ObjectivesStore } from '../objectives.store';
import { provideObjectivesTesting, provideSignedIn, settleObjectives } from '../objectives.testing';
import { habitDetail, metricDetail, objectiveDetail, treeDetail } from '../testing/objectives-fixtures';
import { ObjectiveDetailLayoutComponent } from './objective-detail-layout.component';

/**
 * Integration spec: the real objectives routes are mounted, so these tests also
 * cover lazy loading and the ObjectiveContext inherited by the routed tabs.
 */
describe('ObjectiveDetailLayoutComponent', () => {
  let harness: RouterTestingHarness;
  let store: ObjectivesStore;
  let http: HttpTestingController;

  const element = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const tabLabels = (): string[] =>
    Array.from(element().querySelectorAll('.tabs a')).map((tab) => tab.textContent?.trim() ?? '');
  const layout = (): ObjectiveDetailLayoutComponent =>
    harness.fixture.debugElement.query((node) => node.componentInstance instanceof ObjectiveDetailLayoutComponent)
      .componentInstance as ObjectiveDetailLayoutComponent;
  /** Goes to a URL and answers the request for the objective opened there. */
  const visit = async (url: string, detail = metricDetail()): Promise<void> => {
    const navigating = harness.navigateByUrl(url);
    (await requested(detail.id)).flush(detail);
    await navigating;
    await settleObjectives();
    harness.detectChanges();
  };
  /** The layout is lazy loaded: its request comes when its chunk has arrived, however long that takes. */
  const requested = (id: string): Promise<TestRequest> =>
    vi.waitFor(
      () => {
        const [request] = http.match(`/api/v1/objectives/${id}`);
        if (!request) throw new Error(`No request yet for objective ${id}`);
        return request;
      },
      { timeout: 4000, interval: 10 },
    );
  const visitMissing = async (id: string): Promise<void> => {
    const navigating = harness.navigateByUrl(`/objectives/${id}`);
    (await requested(id)).flush(null, { status: 404, statusText: 'Not Found' });
    await navigating;
    await settleObjectives();
    harness.detectChanges();
  };
  const menu = (): void => {
    (element().querySelector('.more-button') as HTMLButtonElement).click();
    harness.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        ...provideObjectivesTesting([{ path: 'objectives', children: OBJECTIVES_ROUTES }]),
        provideSignedIn(),
      ],
    });
    store = TestBed.inject(ObjectivesStore);
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  it('renders the summary tab and hides the duplicate header title', async () => {
    const markViewed = vi.spyOn(store, 'markViewed');
    await visit('/objectives/obj-1');

    expect(markViewed).toHaveBeenCalledExactlyOnceWith('obj-1');
    expect(tabLabels()).toEqual(['Aperçu', 'Calendrier', 'Statistiques', 'Activité']);
    expect(element().querySelector('h1')?.classList).toContain('visually-hidden');
    expect(element().querySelector('app-objective-summary h2')?.textContent).toContain('Courir 10 km');
  });

  it('shows the header title on other tabs and adapts tabs to the completion mode', async () => {
    await visit('/objectives/obj-1/stats');
    expect(element().querySelector('h1')?.classList).not.toContain('visually-hidden');
    expect(element().querySelector('app-objective-stats')).not.toBeNull();

    await visit('/objectives/obj-2/habit', habitDetail({ id: 'obj-2' }));
    expect(tabLabels()).toEqual(['Aperçu', 'Habitude', 'Activité']);
    expect(element().querySelector('.tabs a.active')?.textContent).toContain('Habitude');
  });

  it('keeps the overview and the activity when there is nothing else', async () => {
    await visit('/objectives/obj-1', treeDetail());

    expect(tabLabels()).toEqual(['Aperçu', 'Activité']);
    expect(element().querySelectorAll('.tabs a')[1].getAttribute('href')).toBe('/objectives/obj-1/activity');
  });

  it('goes down the tree: a breadcrumb up, one level back, not in the recents', async () => {
    const markViewed = vi.spyOn(store, 'markViewed');
    await visit(
      '/objectives/child',
      objectiveDetail({
        id: 'child',
        parentId: 'parent',
        breadcrumb: [
          { id: 'top', title: 'Haut' },
          { id: 'parent', title: 'Parent' },
        ],
      }),
    );

    const crumbs = element().querySelectorAll('.breadcrumb a');
    expect(Array.from(crumbs).map((crumb) => crumb.textContent)).toEqual(['Haut', 'Parent']);
    expect(crumbs[0].getAttribute('href')).toBe('/objectives/top');
    expect(element().querySelector('.nav-link')?.getAttribute('href')).toBe('/objectives/parent');
    expect(markViewed).not.toHaveBeenCalled();
  });

  it('shows parents above what was shared as names, and goes back to the overview', async () => {
    await visit(
      '/objectives/branch',
      objectiveDetail({
        id: 'branch',
        role: 'contributor',
        breadcrumb: [{ id: null, title: 'Haut' }],
      }),
    );

    expect(element().querySelector('.breadcrumb a')).toBeNull();
    expect(element().querySelector('.hidden-crumb')?.textContent).toBe('Haut');
    expect(element().querySelector('.nav-link')?.getAttribute('href')).toBe('/objectives');
  });

  it('goes back to the overview from the top, without a breadcrumb', async () => {
    await visit('/objectives/obj-1');

    expect(element().querySelector('.breadcrumb')).toBeNull();
    expect(element().querySelector('.nav-link')?.getAttribute('href')).toBe('/objectives');
  });

  it('opens another objective without leaving the screen', async () => {
    await visit('/objectives/obj-1', treeDetail());
    await visit('/objectives/child-2', objectiveDetail({ id: 'child-2', title: 'Faire les valises', parentId: 'obj-1' }));

    expect(element().querySelector('app-objective-summary h2')?.textContent).toContain('Faire les valises');
  });

  it('explains when an objective does not exist', async () => {
    const markViewed = vi.spyOn(store, 'markViewed');
    await visitMissing('inconnu');

    expect(markViewed).not.toHaveBeenCalled();
    expect(element().querySelector('.not-found')?.textContent).toContain('n’existe pas');
  });

  it('explains when an objective goes away while it is open', async () => {
    await visit('/objectives/obj-1');

    FakeEventSource.latest()?.emit({ type: 'objective.removed', objectiveId: 'obj-1' });
    await settleObjectives();
    harness.detectChanges();

    expect(element().querySelector('.not-found')?.textContent).toContain('n’existe pas');
  });

  it('shows a failed action from the API', async () => {
    await visit('/objectives/obj-1');

    const updating = store.update('obj-1', { title: 'X' });
    http.expectOne('/api/v1/objectives/obj-1').flush({ message: 'Interdit' }, { status: 403, statusText: 'Forbidden' });
    await updating;
    harness.detectChanges();

    expect(element().querySelector('.action-error')?.textContent).toBe('Interdit');
  });

  describe('actions menu', () => {
    it('edits, pauses, archives and deletes', async () => {
      await visit('/objectives/obj-1');
      menu();

      expect(element().querySelectorAll('.menu a')[1].getAttribute('href')).toBe('/objectives/obj-1/edit');
      expect(element().querySelectorAll('.menu button').length).toBe(4);

      layout().togglePause();
      const pausing = http.expectOne('/api/v1/objectives/obj-1');
      expect(pausing.request.body).toEqual({ paused: true });
      pausing.flush(metricDetail({ status: 'paused' }));
      await settleObjectives();

      layout().togglePause();
      const resuming = http.expectOne('/api/v1/objectives/obj-1');
      expect(resuming.request.body).toEqual({ paused: false });
      resuming.flush(metricDetail());
      await settleObjectives();

      layout().toggleArchive();
      const archiving = http.expectOne('/api/v1/objectives/obj-1');
      expect(archiving.request.body).toEqual({ archived: true });
      archiving.flush(metricDetail({ archived: true }));
      await settleObjectives();
      expect(layout().menuOpen()).toBe(false);
    });

    it('hides the pause action on what is complete', async () => {
      await visit('/objectives/obj-1', objectiveDetail({ status: 'completed' }));
      menu();

      expect(Array.from(element().querySelectorAll('.menu button')).map((button) => button.textContent?.trim())).toEqual([
        'Enregistrer comme modèle',
        'Archiver',
        'Supprimer',
      ]);
    });

    it('offers to resume what is paused and unarchive what is archived', async () => {
      await visit('/objectives/obj-1', objectiveDetail({ status: 'paused', archived: true }));
      menu();

      expect(Array.from(element().querySelectorAll('.menu button')).map((button) => button.textContent?.trim())).toEqual([
        'Enregistrer comme modèle',
        'Reprendre',
        'Désarchiver',
        'Supprimer',
      ]);
    });

    describe('saving as a template', () => {
      const dialog = () => element().querySelector('dialog') as HTMLDialogElement;
      const nameInput = () => element().querySelector('.template-form input') as HTMLInputElement;
      const submit = () =>
        (element().querySelector('.template-form') as HTMLFormElement).dispatchEvent(new Event('submit'));

      const openDialog = async (): Promise<void> => {
        await visit('/objectives/obj-1');
        menu();
        (Array.from(element().querySelectorAll<HTMLButtonElement>('.menu button')).find((button) =>
          button.textContent?.includes('modèle'),
        ) as HTMLButtonElement).click();
        harness.detectChanges();
      };

      it('asks for a name, saves it, and says so', async () => {
        await openDialog();
        expect(dialog().open).toBe(true);
        expect(layout().menuOpen()).toBe(false);

        nameInput().value = '  Mon modèle ';
        submit();
        const request = http.expectOne('/api/v1/objectives/obj-1/template');
        expect(request.request.body).toEqual({ name: 'Mon modèle' });
        request.flush({ id: 't1', name: 'Mon modèle', nodeCount: 1 });
        await settleObjectives();
        harness.detectChanges();

        expect(element().querySelector('.saved')?.textContent).toBe('Modèle enregistré.');
        expect(nameInput().value).toBe('');
      });

      it('sends nothing without a name', async () => {
        await openDialog();

        nameInput().value = '   ';
        submit();

        http.expectNone('/api/v1/objectives/obj-1/template');
      });

      it('keeps the name when saving fails', async () => {
        await openDialog();

        nameInput().value = 'Mon modèle';
        submit();
        http.expectOne('/api/v1/objectives/obj-1/template').flush(null, { status: 500, statusText: 'Error' });
        await settleObjectives();
        harness.detectChanges();

        expect(nameInput().value).toBe('Mon modèle');
        expect(element().querySelector('.saved')).toBeNull();
      });

      it('closes from its button', async () => {
        await openDialog();

        (element().querySelector('.template-form .secondary') as HTMLButtonElement).click();
        harness.detectChanges();

        expect(dialog().open).toBe(false);
      });
    });

    it('asks before deleting, says what goes with it, and goes back one level', async () => {
      await visit(
        '/objectives/child',
        treeDetail({ id: 'child', parentId: 'parent', breadcrumb: [{ id: 'parent', title: 'Parent' }] }),
      );
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await layout().remove();
      // Cancelled: nothing removed, the user stays on the page.
      http.expectNone({ method: 'DELETE' });
      expect(navigate).not.toHaveBeenCalled();
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'danger',
          message: '« Préparer le voyage » et ses 2 sous-objectifs seront supprimés définitivement.',
        }),
      );

      confirm.mockResolvedValue(true);
      const removing = layout().remove();
      await settleObjectives();
      const request = http.expectOne('/api/v1/objectives/child');
      expect(request.request.method).toBe('DELETE');
      request.flush(null);
      await removing;

      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/objectives', 'parent']);
    });

    it('words the question for one sub-objective, and for none', async () => {
      await visit('/objectives/obj-1', treeDetail({ descendantCount: 1 }));
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await layout().remove();
      expect(confirm).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: '« Préparer le voyage » et son sous-objectif seront supprimés définitivement.',
        }),
      );

      await visit('/objectives/obj-2', objectiveDetail({ id: 'obj-2' }));
      await layout().remove();
      expect(confirm).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: '« Courir 10 km » sera supprimé définitivement.' }),
      );
    });

    it('stays when deleting fails', async () => {
      await visit('/objectives/obj-1');
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      const removing = layout().remove();
      await settleObjectives();
      http.expectOne('/api/v1/objectives/obj-1').flush(null, { status: 500, statusText: 'Error' });
      await removing;

      expect(navigate).not.toHaveBeenCalled();
    });

    it('only offers the people to someone who does not own the objective', async () => {
      await visit('/objectives/obj-1', metricDetail({ role: 'contributor' }));
      menu();

      const links = element().querySelectorAll('.menu a');
      expect(links).toHaveLength(1);
      expect(links[0].textContent).toBe('Personnes');
      expect(links[0].getAttribute('href')).toBe('/objectives/obj-1/share');
      // Saving what they can see as a template is all they can do from here.
      expect(Array.from(element().querySelectorAll('.menu button')).map((button) => button.textContent)).toEqual([
        'Enregistrer comme modèle',
      ]);
    });

    it('offers the owner to share', async () => {
      await visit('/objectives/obj-1');
      menu();

      expect(element().querySelector('.menu a')?.textContent).toBe('Partager');
    });

    it('ignores menu actions when the objective is missing', async () => {
      await visitMissing('inconnu');
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      layout().togglePause();
      layout().toggleArchive();
      await layout().remove();

      expect(confirm).not.toHaveBeenCalled();
      http.verify();
      expect(layout().tabs()).toEqual([]);
    });
  });
});
