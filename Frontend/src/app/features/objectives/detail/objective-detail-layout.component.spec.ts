import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ObjectivesStore } from '../objectives.store';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { OBJECTIVES_ROUTES } from '../objectives.routes';
import { provideObjectivesTesting } from '../objectives.testing';
import { ObjectiveDetailLayoutComponent } from './objective-detail-layout.component';

/**
 * Integration spec: the real objectives routes are mounted, so these tests also
 * cover lazy loading and the ObjectiveContext inherited by the routed tabs.
 */
describe('ObjectiveDetailLayoutComponent', () => {
  let harness: RouterTestingHarness;
  let store: ObjectivesStore;

  const element = (): HTMLElement => harness.routeNativeElement as HTMLElement;
  const tabLabels = (): string[] =>
    Array.from(element().querySelectorAll('.tabs a')).map((tab) => tab.textContent?.trim() ?? '');
  const layout = (): ObjectiveDetailLayoutComponent =>
    harness.fixture.debugElement.query((node) => node.componentInstance instanceof ObjectiveDetailLayoutComponent)
      .componentInstance as ObjectiveDetailLayoutComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: provideObjectivesTesting([{ path: 'objectives', children: OBJECTIVES_ROUTES }]),
    });
    store = TestBed.inject(ObjectivesStore);
    harness = await RouterTestingHarness.create();
  });

  it('renders the summary tab and hides the duplicate header title', async () => {
    const markViewed = vi.spyOn(store, 'markViewed');
    await harness.navigateByUrl('/objectives/courir-10-km');

    expect(markViewed).toHaveBeenCalledTimes(1);
    expect(markViewed).toHaveBeenCalledWith('courir-10-km');
    expect(tabLabels()).toEqual(['Aperçu', 'Calendrier', 'Statistiques']);
    expect(element().querySelector('h1')?.classList).toContain('visually-hidden');
    expect(element().querySelector('app-objective-summary h2')?.textContent).toContain('Courir 10 km');
    expect(store.recent()[0].id).toBe('courir-10-km');
  });

  it('shows the header title on other tabs and adapts tabs to the tracking mode', async () => {
    await harness.navigateByUrl('/objectives/courir-10-km/stats');
    expect(element().querySelector('h1')?.classList).not.toContain('visually-hidden');
    expect(element().querySelector('app-objective-stats')).not.toBeNull();

    await harness.navigateByUrl('/objectives/apprendre-italien/steps');
    expect(tabLabels()).toEqual(['Aperçu', 'Étapes']);
    expect(element().querySelector('.tabs a.active')?.textContent).toContain('Étapes');
    expect(element().querySelector('app-objective-steps li strong')?.textContent).toBe('Apprendre 100 mots');
  });

  it('explains when an objective does not exist', async () => {
    const markViewed = vi.spyOn(store, 'markViewed');
    await harness.navigateByUrl('/objectives/inconnu');

    expect(markViewed).not.toHaveBeenCalled();
    expect(element().querySelector('.not-found')?.textContent).toContain('n’existe pas');
    expect(store.recent().map((item) => item.id)).not.toContain('inconnu');
  });

  it('pauses, archives and deletes from the actions menu', async () => {
    await harness.navigateByUrl('/objectives/courir-10-km');
    (element().querySelector('.more-button') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(element().querySelectorAll('.menu button').length).toBe(3);

    const setPaused = vi.spyOn(store, 'setPaused');
    const update = vi.spyOn(store, 'update');
    const remove = vi.spyOn(store, 'remove');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    layout().togglePause();
    expect(setPaused).toHaveBeenLastCalledWith('courir-10-km', true);
    expect(store.find('courir-10-km')?.status).toBe('paused');
    layout().togglePause();
    expect(setPaused).toHaveBeenLastCalledWith('courir-10-km', false);
    expect(setPaused).toHaveBeenCalledTimes(2);
    expect(store.find('courir-10-km')?.status).toBe('active');

    // setPaused() writes through update() itself: only count the archive action.
    update.mockClear();
    layout().toggleArchive();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('courir-10-km', { archived: true });
    expect(store.find('courir-10-km')?.archived).toBe(true);

    const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    await layout().remove();
    // Cancelled: nothing removed, the user stays on the page.
    expect(remove).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(store.find('courir-10-km')).toBeDefined();

    confirm.mockResolvedValue(true);
    await layout().remove();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('courir-10-km');
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: 'danger',
        message: '« Courir 10 km » sera supprimé définitivement.',
      }),
    );
    expect(store.find('courir-10-km')).toBeUndefined();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/objectives');
  });

  it('hides the delete action on objectives owned by someone else', async () => {
    await harness.navigateByUrl('/objectives/economiser-1000');
    (element().querySelector('.more-button') as HTMLButtonElement).click();
    harness.detectChanges();

    expect(element().querySelector('.menu .danger')).toBeNull();
  });

  it('ignores menu actions when the objective is missing', async () => {
    await harness.navigateByUrl('/objectives/inconnu');
    const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    const setPaused = vi.spyOn(store, 'setPaused');
    const update = vi.spyOn(store, 'update');
    const remove = vi.spyOn(store, 'remove');
    layout().togglePause();
    layout().toggleArchive();
    await layout().remove();

    expect(confirm).not.toHaveBeenCalled();
    expect(setPaused).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(layout().tabs()).toEqual([]);
  });
});
