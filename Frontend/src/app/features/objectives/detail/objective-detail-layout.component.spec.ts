import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ObjectivesStore } from '../objectives.store';
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
    await harness.navigateByUrl('/objectives/courir-10-km');

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
    await harness.navigateByUrl('/objectives/inconnu');

    expect(element().querySelector('.not-found')?.textContent).toContain('n’existe pas');
    expect(store.recent().map((item) => item.id)).not.toContain('inconnu');
  });

  it('pauses, archives and deletes from the actions menu', async () => {
    await harness.navigateByUrl('/objectives/courir-10-km');
    (element().querySelector('.more-button') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(element().querySelectorAll('.menu button').length).toBe(3);

    layout().togglePause();
    expect(store.find('courir-10-km')?.status).toBe('paused');
    layout().togglePause();
    expect(store.find('courir-10-km')?.status).toBe('active');

    layout().toggleArchive();
    expect(store.find('courir-10-km')?.archived).toBeTrue();

    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    layout().remove();
    expect(store.find('courir-10-km')).toBeDefined();

    confirm.and.returnValue(true);
    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    layout().remove();
    expect(store.find('courir-10-km')).toBeUndefined();
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
    const confirm = spyOn(window, 'confirm');
    layout().togglePause();
    layout().toggleArchive();
    layout().remove();

    expect(confirm).not.toHaveBeenCalled();
    expect(layout().tabs()).toEqual([]);
  });
});
