import { onTestFinished } from 'vitest';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';
import type { MockInstance } from 'vitest';
import type { ObjectiveDetail } from '@plano/common';
import { ConfirmService } from '../../../../shared/ui/confirm.service';
import { ObjectivesStore } from '../../objectives.store';
import {
  openObjective,
  provideObjectiveContext,
  provideObjectivesTesting,
  provideSignedIn,
  settleObjectives,
} from '../../objectives.testing';
import {
  habitDetail,
  metricDetail,
  objectiveDetail,
  objectiveSummary,
  treeDetail,
} from '../../testing/objectives-fixtures';
import { ObjectiveSummaryComponent } from './objective-summary.component';

describe('ObjectiveSummaryComponent', () => {
  let fixture: ComponentFixture<ObjectiveSummaryComponent>;
  let component: ObjectiveSummaryComponent;
  let element: HTMLElement;
  let store: ObjectivesStore;
  let http: HttpTestingController;

  const tiles = (): string[] =>
    Array.from(element.querySelectorAll('.tile')).map(
      (tile) => `${tile.querySelector('strong')?.textContent} ${tile.querySelector('span')?.textContent}`,
    );
  /** Answers the request a change just made, and returns its body. */
  const answer = async (url: string, detail: ObjectiveDetail = objectiveDetail()): Promise<unknown> => {
    const request = http.expectOne(`/api/v1/objectives/obj-1${url}`);
    request.flush(detail);
    await settleObjectives();
    fixture.detectChanges();
    return request.request.body;
  };

  async function show(detail: ObjectiveDetail): Promise<void> {
    await openObjective(detail);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveSummaryComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('obj-1'), provideSignedIn()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ObjectiveSummaryComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('renders nothing until the objective is there', () => {
    expect(element.querySelector('.hero')).toBeNull();
    expect(component.view()).toBeNull();
  });

  describe('swiping a sub-objective', () => {
    const swipeLeft = (id: string) => {
      const slide = element.querySelector(`.child-item[data-child-id="${id}"] .slide`) as HTMLElement;
      slide.setPointerCapture = vi.fn();
      const pointer = (type: string, clientX: number) =>
        slide.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX, bubbles: true, cancelable: true }));
      pointer('pointerdown', 200);
      pointer('pointermove', 100);
      pointer('pointerup', 100);
      fixture.detectChanges();
    };
    const children = () =>
      Array.from(element.querySelectorAll<HTMLElement>('.child-item')).map((item) => item.dataset['childId']);
    const withChildren = (role: ObjectiveDetail['role']) =>
      objectiveDetail({
        role,
        children: [objectiveSummary({ id: 'a', title: 'A', role }), objectiveSummary({ id: 'b', title: 'B', role })],
        childCount: 2,
      });

    it('deletes it once confirmed and shows the parent as the server now has it', async () => {
      await show(withChildren('owner'));
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      swipeLeft('a');
      await settleObjectives();
      expect(confirm).toHaveBeenCalledTimes(1);
      const removal = http.expectOne('/api/v1/objectives/a');
      expect(removal.request.method).toBe('DELETE');
      removal.flush(null);
      await settleObjectives();

      const reload = http.expectOne('/api/v1/objectives/obj-1');
      expect(reload.request.method).toBe('GET');
      reload.flush(objectiveDetail({ role: 'owner', children: [objectiveSummary({ id: 'b', title: 'B' })], childCount: 1, percent: 40 }));
      await settleObjectives();
      fixture.detectChanges();

      expect(children()).toEqual(['b']);
      expect(store.detail()?.percent).toBe(40);
    });

    it('sends nothing when the question is declined', async () => {
      await show(withChildren('owner'));
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      swipeLeft('a');
      await settleObjectives();

      expect(children()).toEqual(['a', 'b']);
      http.expectNone('/api/v1/objectives/a');
    });

    it('tells a contributor only the owner can delete it', async () => {
      await show(withChildren('contributor'));
      const confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask');

      swipeLeft('a');

      expect(confirm).not.toHaveBeenCalled();
      expect(element.querySelector('.toast')?.textContent).toContain('Seule la personne qui a créé cet objectif peut le supprimer.');
    });
  });

  describe('bars', () => {
    it('shows the completion bar', async () => {
      await show(metricDetail({ dueDate: '2026-11-30' }));

      expect(element.querySelector('h2')?.textContent).toContain('Courir 10 km');
      expect(element.querySelector('.due')?.textContent).toBe('Échéance : 30 nov. 2026');
      expect(element.querySelector('.percent')?.textContent).toBe('65 %');
      expect(element.querySelector('.hero > [role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('65');
    });

    it('shows progress as amounts when percentages are turned off', async () => {
      store.updateSettings({ showPercentage: false });
      await show(metricDetail());

      expect(element.querySelector('.percent')?.textContent).toBe('6,5 / 10 km');
    });

    it('shows no bar at all without one', async () => {
      await show(objectiveDetail());

      expect(element.querySelector('.percent')).toBeNull();
      expect(element.querySelector('[role="progressbar"]')).toBeNull();
    });

    it('shows the timelapse bar, red and late past the deadline', async () => {
      await show(objectiveDetail({ timelapse: 'elapsed', startDate: '2026-10-01', dueDate: '2026-10-11' }));

      const bar = element.querySelector('app-timelapse-bar') as HTMLElement;
      expect(bar.textContent).toContain('4 jours de retard');
      expect(bar.classList).toContain('overdue');
      expect(bar.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    });

    it('shows paused and archived objectives as such', async () => {
      await show(objectiveDetail({ status: 'paused' }));
      expect(element.querySelector('.pill')?.textContent).toBe('En pause');

      await show(objectiveDetail({ archived: true }));
      expect(element.querySelector('.pill')?.textContent).toBe('Archivé');
    });
  });

  describe('key figures', () => {
    it('adapts them to the completion mode and deadline', async () => {
      await show(metricDetail({ dueDate: '2026-11-30' }));
      expect(tiles()).toEqual(['6,5 km Meilleure valeur', '2 Séances', '46 jours Restants']);

      await show(metricDetail({ metric: { unit: 'km', target: 10, aggregation: 'sum' } }));
      expect(tiles()[0]).toBe('6,5 km Cumulé');

      await show(habitDetail());
      expect(tiles().slice(0, 2)).toEqual(['3 Jours réussis', '2 j Meilleure série']);

      await show(treeDetail());
      expect(tiles().slice(0, 2)).toEqual(['1 / 2 Terminés', '1 À faire']);

      // Tiles are tracked by their label: a deadline among them must not collide.
      await show(treeDetail({ dueDate: '2026-11-30' }));
      const labels = tiles().map((tile) => tile.split(' ').at(-1));
      expect(new Set(labels).size).toBe(labels.length);
    });

    it('counts only the signed-in person’s days', async () => {
      await show(
        habitDetail({
          checkIns: [
            { date: '2026-10-05', userId: 'user-ada' },
            { date: '2026-10-05', userId: 'user-bob' },
            { date: '2026-10-06', userId: 'user-bob' },
          ],
        }),
      );
      expect(tiles()[0]).toBe('1 Jours réussis');
    });

    it('gives the state of the deadline', async () => {
      await show(metricDetail({ dueDate: '2026-10-14' }));
      expect(tiles()[2]).toBe('1 jour De retard');

      await show(metricDetail({ dueDate: '2026-10-16' }));
      expect(tiles()[2]).toBe('1 jour Restants');

      await show(metricDetail());
      expect(tiles()[2]).toBe('— Sans échéance');
      expect(element.querySelector('.due')?.textContent).toBe('Sans échéance');

      await show(metricDetail({ status: 'completed', completedAt: '2026-08-30T12:00:00.000Z' }));
      expect(tiles()[2]).toBe('Terminé 30 août');
    });

    it('hides the section when there is only a deadline to tell', async () => {
      await show(objectiveDetail());
      expect(element.querySelector('.tiles')).toBeNull();
    });
  });

  describe('manual progress', () => {
    const slider = () => element.querySelector('.manual input') as HTMLInputElement | null;

    it('moves the bar for those who can contribute', async () => {
      await show(objectiveDetail({ completion: 'manual', percent: 30, manualProgress: 30 }));
      const input = slider() as HTMLInputElement;
      expect(input.value).toBe('30');

      input.value = '55';
      input.dispatchEvent(new Event('change'));

      expect(await answer('/progress')).toEqual({ percent: 55 });
    });

    it('is locked while paused, and hidden from viewers and other modes', async () => {
      await show(objectiveDetail({ completion: 'manual', percent: 30, status: 'paused' }));
      expect(slider()?.disabled).toBe(true);

      await show(objectiveDetail({ completion: 'manual', percent: 30, role: 'viewer' }));
      expect(slider()).toBeNull();

      await show(metricDetail());
      expect(slider()).toBeNull();
    });
  });

  describe('marking complete', () => {
    const button = () => element.querySelector('.complete-button') as HTMLButtonElement | null;

    it('completes and reopens an objective without a bar', async () => {
      await show(objectiveDetail());
      expect(button()?.textContent).toBe('Marquer comme terminé');

      button()?.click();
      expect(await answer('/completed', objectiveDetail({ status: 'completed' }))).toEqual({ completed: true });
      expect(button()?.textContent).toBe('Rouvrir');

      button()?.click();
      expect(await answer('/completed')).toEqual({ completed: false });
    });

    it('is not offered to viewers, on paused objectives, or when a bar decides', async () => {
      await show(objectiveDetail({ role: 'viewer' }));
      expect(button()).toBeNull();

      await show(objectiveDetail({ status: 'paused' }));
      expect(button()).toBeNull();

      await show(metricDetail());
      expect(button()).toBeNull();
    });
  });

  describe('sub-objectives', () => {
    const titles = () =>
      Array.from(element.querySelectorAll('.child-item app-objective-card strong')).map((node) => node.textContent);

    it('lists them with their state, linked to their own page', async () => {
      await show(treeDetail());

      expect(titles()).toEqual(['Réserver', 'Faire les valises']);
      expect(element.querySelector('.heading span')?.textContent).toBe('1 / 2');
      expect(element.querySelector('.child-item a')?.getAttribute('href')).toBe('/objectives/child-1');
    });

    it('offers the owner to add one under this objective', async () => {
      await show(objectiveDetail());

      const add = element.querySelector('.add-child') as HTMLAnchorElement;
      expect(add.getAttribute('href')).toBe('/objectives/new?parent=obj-1');
      expect(element.querySelector('.heading span')).toBeNull();
    });

    it('hides the section from others when there are none', async () => {
      await show(objectiveDetail({ role: 'contributor' }));
      expect(element.querySelector('.children')).toBeNull();
    });

    it('shows them to others, without adding or moving', async () => {
      await show(treeDetail({ role: 'viewer' }));

      expect(titles()).toHaveLength(2);
      expect(element.querySelector('.add-child')).toBeNull();
      expect(element.querySelector('.drag-handle')).toBeNull();
      expect(element.querySelector('.toggle')).toBeNull();
    });

    it('ticks one without a bar from here, then reloads the parent', async () => {
      await show(treeDetail());
      const toggles = element.querySelectorAll<HTMLButtonElement>('.toggle');
      expect(toggles[0].getAttribute('aria-pressed')).toBe('true');
      expect(toggles[0].getAttribute('aria-label')).toBe('Rouvrir Réserver');
      expect(toggles[1].getAttribute('aria-label')).toBe('Terminer Faire les valises');

      toggles[1].click();
      const request = http.expectOne('/api/v1/objectives/child-2/completed');
      expect(request.request.body).toEqual({ completed: true });
      // A second tap while it is on its way sends nothing.
      toggles[1].click();
      request.flush(objectiveDetail({ id: 'child-2' }));
      await settleObjectives();
      http.expectOne('/api/v1/objectives/obj-1').flush(treeDetail({ percent: 100 }));
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.percent')?.textContent).toBe('100 %');
      expect(component.toggling()).toBe('');
    });

    it('reopens a ticked one', async () => {
      await show(treeDetail());
      element.querySelector<HTMLButtonElement>('.toggle')?.click();

      const request = http.expectOne('/api/v1/objectives/child-1/completed');
      expect(request.request.body).toEqual({ completed: false });
      request.flush(objectiveDetail({ id: 'child-1' }));
      await settleObjectives();
      http.expectOne('/api/v1/objectives/obj-1').flush(treeDetail());
      await settleObjectives();
    });

    it('offers no tick for one with its own bar, or paused', async () => {
      await show(
        treeDetail({
          children: [
            objectiveSummary({ id: 'bar', parentId: 'obj-1', completion: 'manual', percent: 10 }),
            objectiveSummary({ id: 'paused', parentId: 'obj-1', status: 'paused' }),
          ],
        }),
      );
      const toggles = element.querySelectorAll<HTMLButtonElement>('.toggle');

      expect(toggles).toHaveLength(1);
      expect(toggles[0].disabled).toBe(true);
    });

    describe('moving', () => {
      const handle = (id: string) =>
        element.querySelector(`.child-item[data-child-id="${id}"] .drag-handle`) as HTMLButtonElement;
      const pointer = (type: string, target: Element, x = 0, y = 0) =>
        target.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      let under: Element | null = null;
      let elementFromPoint: MockInstance<Document['elementFromPoint']>;

      beforeEach(() => {
        under = null;
        elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockImplementation(() => under);
      });
      afterEach(() => elementFromPoint.mockRestore());

      it('drags one onto another, and saves on release', async () => {
        await show(treeDetail());
        const grip = handle('child-2');
        grip.setPointerCapture = vi.fn();

        pointer('pointerdown', grip);
        under = element.querySelector('.child-item[data-child-id="child-1"] strong');
        pointer('pointermove', grip, 10, 20);
        fixture.detectChanges();
        expect(titles()).toEqual(['Faire les valises', 'Réserver']);
        http.expectNone('/api/v1/objectives/obj-1/children/order');

        pointer('pointerup', grip);
        expect(await answer('/children/order', treeDetail())).toEqual({ objectiveIds: ['child-2', 'child-1'] });
      });

      it('moves one with the arrow keys', async () => {
        await show(treeDetail());

        handle('child-1').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        fixture.detectChanges();

        expect(await answer('/children/order', treeDetail())).toEqual({ objectiveIds: ['child-2', 'child-1'] });
      });

      it('offers no grip for a single one', async () => {
        await show(treeDetail({ children: [objectiveSummary({ id: 'only', parentId: 'obj-1' })] }));
        expect(element.querySelector('.drag-handle')).toBeNull();
      });
    });
  });

  describe('people', () => {
    const shareRow = () => element.querySelector('a.row') as HTMLAnchorElement;

    it('leads to sharing, and says when nobody else is there', async () => {
      await show(objectiveDetail());

      expect(shareRow().getAttribute('href')).toBe('/objectives/obj-1/share');
      expect(shareRow().textContent).toContain('Partager');
      expect(shareRow().textContent).toContain('Personne pour l’instant');
      expect(element.querySelector('app-avatar-stack .avatars')).toBeNull();
    });

    it('shows who it is shared with', async () => {
      await show(
        objectiveDetail({
          people: [
            { id: 'a', name: 'Ada Lovelace', avatarVersion: null },
            { id: 'b', name: 'Bob Martin', avatarVersion: null },
          ],
        }),
      );

      expect(shareRow().textContent).toContain('Partagé avec');
      expect(element.querySelector('app-avatar-stack .avatars')?.getAttribute('aria-label')).toBe('Ada Lovelace, Bob Martin');
    });

    it('shows their pictures', async () => {
      await show(
        objectiveDetail({
          people: [
            { id: 'a', name: 'Ada Lovelace', avatarVersion: null },
            { id: 'b', name: 'Bob Martin', avatarVersion: 42 },
          ],
        }),
      );

      const avatars = element.querySelectorAll('app-avatar-stack .avatar');
      expect(avatars[0].querySelector('img')).toBeNull();
      expect(avatars[1].querySelector('img')?.getAttribute('src')).toBe('/api/v1/users/b/avatar?v=42');
    });

    it('labels the sub-objectives shared or assigned', async () => {
      await show(
        treeDetail({
          children: [
            objectiveSummary({ id: 'x', parentId: 'obj-1', sharing: 'common', assignee: { id: 'b', name: 'Bob', avatarVersion: null } }),
          ],
        }),
      );

      expect(element.querySelector('.child-item .sharing')?.textContent).toBe('Commun · Pour Bob');
    });
  });

  describe('contributions', () => {
    const bob = { id: 'b', name: 'Bob Martin', avatarVersion: null };
    const ada = { id: 'a', name: 'Ada Lovelace', avatarVersion: null };
    const lines = () =>
      Array.from(element.querySelectorAll('.contributions li')).map(
        (line) => `${line.querySelector('span')?.textContent} ${line.querySelector('b')?.textContent}`,
      );

    it('stays hidden with one person', async () => {
      await show(metricDetail({ contributions: [{ person: ada, value: 3 }] }));
      expect(element.querySelector('.contributions')).toBeNull();
    });

    it('shows each share, in the objective’s unit', async () => {
      await show(
        metricDetail({
          contributions: [
            { person: ada, value: 6.5 },
            { person: bob, value: 2 },
          ],
        }),
      );

      expect(lines()).toEqual(['Ada Lovelace 6,5 km', 'Bob Martin 2 km']);
      const bars = element.querySelectorAll<HTMLElement>('.contributions em');
      expect(bars[0].style.width).toBe('100%');
      expect(bars[1].style.width).toBe('31%');
    });

    it('counts days on a habit and sub-objectives on a tree', async () => {
      const contributions = [
        { person: ada, value: 3 },
        { person: bob, value: 0 },
      ];
      await show(habitDetail({ contributions }));
      expect(lines()).toEqual(['Ada Lovelace 3 j', 'Bob Martin 0 j']);

      await show(treeDetail({ contributions }));
      expect(lines()[0]).toBe('Ada Lovelace 3 terminé(s)');
    });

    it('survives everyone at zero', async () => {
      await show(
        habitDetail({
          contributions: [
            { person: ada, value: 0 },
            { person: bob, value: 0 },
          ],
        }),
      );
      expect(element.querySelector<HTMLElement>('.contributions em')?.style.width).toBe('0%');
    });
  });

  describe('assigning', () => {
    const people = [
      { id: 'a', name: 'Ada Lovelace', avatarVersion: null },
      { id: 'b', name: 'Bob Martin', avatarVersion: null },
    ];
    const select = () => element.querySelector('.assign select') as HTMLSelectElement | null;

    it('lets the owner assign a sub-objective to someone, and take it back', async () => {
      await show(objectiveDetail({ parentId: 'parent', people }));
      expect(select()?.value).toBe('');

      (select() as HTMLSelectElement).value = 'b';
      select()?.dispatchEvent(new Event('change'));
      expect(await answer('', objectiveDetail({ parentId: 'parent', people, assignee: people[1] }))).toEqual({
        assignedToUserId: 'b',
      });
      expect(select()?.value).toBe('b');

      (select() as HTMLSelectElement).value = '';
      select()?.dispatchEvent(new Event('change'));
      expect(await answer('')).toEqual({ assignedToUserId: null });
    });

    it('only tells others who it is for', async () => {
      await show(objectiveDetail({ parentId: 'parent', people, role: 'viewer', assignee: people[1] }));
      expect(select()).toBeNull();
      expect(element.querySelector('.assign small')?.textContent).toBe('Bob Martin');

      await show(objectiveDetail({ parentId: 'parent', people, role: 'viewer' }));
      expect(element.querySelector('.assign small')?.textContent).toBe('Personne');
    });

    it('does not apply to a top-level objective, or with nobody to assign', async () => {
      await show(objectiveDetail({ people }));
      expect(element.querySelector('.assign')).toBeNull();

      await show(objectiveDetail({ parentId: 'parent' }));
      expect(element.querySelector('.assign')).toBeNull();
    });
  });

  describe('owner’s edits', () => {
    it('renames inline and lets Escape cancel', async () => {
      await show(objectiveDetail());
      (element.querySelector('h2 button') as HTMLButtonElement).click();
      fixture.detectChanges();
      TestBed.tick();
      const input = element.querySelector('.title-input') as HTMLInputElement;
      expect(document.activeElement).toBe(input);

      input.value = '  Courir 12 km ';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
      expect(await answer('', objectiveDetail({ title: 'Courir 12 km' }))).toEqual({ title: 'Courir 12 km' });

      (element.querySelector('h2 button') as HTMLButtonElement).click();
      fixture.detectChanges();
      const second = element.querySelector('.title-input') as HTMLInputElement;
      second.value = 'Ignoré';
      second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      // The trailing blur after Escape must not save the draft.
      component.saveTitle('Ignoré');
      http.expectNone('/api/v1/objectives/obj-1');
    });

    it('sends nothing for a blank or unchanged title', async () => {
      await show(objectiveDetail());

      component.editingTitle.set(true);
      component.saveTitle('   ');
      component.editingTitle.set(true);
      component.saveTitle('Courir 10 km');

      http.expectNone('/api/v1/objectives/obj-1');
      expect(component.editingTitle()).toBe(false);
    });

    it('edits description and plan from expandable rows', async () => {
      await show(objectiveDetail());
      const rows = element.querySelectorAll<HTMLButtonElement>('button.row');

      rows[0].click();
      fixture.detectChanges();
      const textarea = element.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = ' Nouvelle description ';
      textarea.dispatchEvent(new Event('change'));
      expect(await answer('')).toEqual({ description: 'Nouvelle description' });

      element.querySelectorAll<HTMLButtonElement>('button.row')[1].click();
      fixture.detectChanges();
      expect(element.querySelector('textarea')).toBeNull();
      const plan = element.querySelector('input.editor') as HTMLInputElement;
      plan.value = '4 sorties par semaine';
      plan.dispatchEvent(new Event('change'));
      expect(await answer('')).toEqual({ plan: '4 sorties par semaine' });
    });

    it('saves the plan when Enter is pressed in it', async () => {
      // In the document, so the field can hold the focus that Enter takes away.
      document.body.append(element);
      onTestFinished(() => element.remove());
      await show(objectiveDetail());
      component.toggleRow('plan');
      fixture.detectChanges();
      const plan = element.querySelector('input.editor') as HTMLInputElement;
      await userEvent.fill(plan, 'Le matin');
      await userEvent.keyboard('{Enter}');

      expect(document.activeElement).not.toBe(plan);
      expect(await answer('')).toEqual({ plan: 'Le matin' });
    });

    it('closes an open row', async () => {
      await show(objectiveDetail());

      component.toggleRow('plan');
      component.toggleRow('plan');

      expect(component.openRow()).toBeNull();
    });
  });

  describe('for those who do not own it', () => {
    it('offers no renaming, and shows texts without editing them', async () => {
      await show(objectiveDetail({ role: 'contributor', description: 'Une fois', plan: 'Souvent' }));

      expect(element.querySelector('h2 button')).toBeNull();
      const rows = element.querySelectorAll<HTMLButtonElement>('button.row');
      expect(rows[0].disabled).toBe(true);
      expect(rows[0].textContent).toContain('Une fois');
      expect(rows[1].disabled).toBe(true);
      // Their reminders remain theirs to set.
      expect(rows[2].disabled).toBe(false);
    });

    it('hides empty texts', async () => {
      await show(objectiveDetail({ role: 'viewer' }));

      const rows = element.querySelectorAll('button.row');
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('Mes rappels');
    });
  });

  describe('repeating', () => {
    const lines = () => Array.from(element.querySelectorAll('.periods li')).map((line) => line.textContent);

    it('says nothing for what does not repeat', async () => {
      await show(objectiveDetail());

      expect(element.querySelectorAll('.due')).toHaveLength(1);
      expect(element.querySelector('.periods')).toBeNull();
    });

    it('says how it repeats, and how past periods ended', async () => {
      await show(
        metricDetail({
          recurrence: 'monthly',
          periods: [
            { startDate: '2026-09-01', endDate: '2026-09-30', percent: 100, completed: true },
            { startDate: '2026-08-01', endDate: '2026-08-31', percent: 40, completed: false },
          ],
        }),
      );

      expect(element.querySelectorAll('.due')[1].textContent).toBe('Se répète chaque mois');
      expect(lines()).toEqual(['1 sept. – 30 sept.100 %', '1 août – 31 août40 %']);
      expect(element.querySelector('.periods li')?.classList).toContain('done');
      expect(element.querySelectorAll('.periods li')[1].classList).not.toContain('done');
    });

    it('words the result of a period without a bar', async () => {
      await show(
        objectiveDetail({
          recurrence: 'weekly',
          periods: [
            { startDate: '2026-10-05', endDate: '2026-10-11', percent: null, completed: true },
            { startDate: '2026-09-28', endDate: '2026-10-04', percent: null, completed: false },
          ],
        }),
      );

      expect(element.querySelector('.due:nth-of-type(2)')?.textContent).toBe('Se répète chaque semaine');
      expect(lines()[0]).toContain('Terminé');
      expect(lines()[1]).toContain('Non terminé');
    });

    it('says when it repeats each year', async () => {
      await show(objectiveDetail({ recurrence: 'yearly' }));

      expect(element.querySelectorAll('.due')[1].textContent).toBe('Se répète chaque année');
    });
  });

  describe('home page', () => {
    const toggle = () => element.querySelector('.home-pin button') as HTMLButtonElement;

    it('pins and unpins, for anyone who can open it', async () => {
      await show(objectiveDetail({ role: 'viewer' }));
      expect(toggle().getAttribute('aria-checked')).toBe('false');

      toggle().click();
      expect(await answer('/preferences', objectiveDetail({ onHome: true }))).toEqual({ onHome: true });
      expect(toggle().getAttribute('aria-checked')).toBe('true');

      toggle().click();
      expect(await answer('/preferences', objectiveDetail())).toEqual({ onHome: false });
    });
  });

  describe('reminders', () => {
    const weekly = { frequency: 'weekly', time: '09:00', weekday: 0 } as const;

    it('keeps them to the signed-in person', async () => {
      await show(objectiveDetail({ reminder: weekly, dueReminder: 'day-before' }));
      expect(element.textContent).toContain('Chaque lundi à 09:00 · Échéance : 1 jour avant');
      component.toggleRow('reminder');
      fixture.detectChanges();
      const selects = element.querySelectorAll<HTMLSelectElement>('.reminder-editor select');
      // Weekly reminder: frequency, weekday and due-date selects are visible.
      expect(selects.length).toBe(3);

      selects[1].value = '2';
      selects[1].dispatchEvent(new Event('change'));
      expect(await answer('/preferences', objectiveDetail({ reminder: { ...weekly, weekday: 2 } }))).toEqual({
        reminder: { ...weekly, weekday: 2 },
      });

      element.querySelectorAll<HTMLSelectElement>('.reminder-editor select')[2].value = 'week-before';
      element.querySelectorAll<HTMLSelectElement>('.reminder-editor select')[2].dispatchEvent(new Event('change'));
      expect(await answer('/preferences', objectiveDetail({ reminder: weekly }))).toEqual({ dueReminder: 'week-before' });

      const time = element.querySelector('.reminder-editor input') as HTMLInputElement;
      time.value = '07:30';
      time.dispatchEvent(new Event('change'));
      expect(await answer('/preferences', objectiveDetail())).toEqual({ reminder: { ...weekly, time: '07:30' } });

      expect(element.querySelector('.reminder-editor input')).toBeNull();
    });
  });

  it('ignores edits once the objective is gone', async () => {
    component.editingTitle.set(true);
    component.saveTitle('Fantôme');
    component.updateText('plan', 'x');
    component.updateReminder({ time: '10:00' });
    component.updateDueReminder('none');
    component.setProgress(10);
    component.toggleCompleted();
    component.assign('someone');
    component.toggleHome();

    http.expectNone({ method: 'PATCH' });
    http.expectNone({ method: 'PUT' });
    expect(component.view()).toBeNull();
  });
});
