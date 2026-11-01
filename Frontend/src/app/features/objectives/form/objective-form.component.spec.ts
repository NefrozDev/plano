import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import type { Mock } from 'vitest';
import { ObjectivesStore } from '../objectives.store';
import { openObjective, provideObjectivesTesting, settleObjectives } from '../objectives.testing';
import { metricDetail, objectiveDetail } from '../testing/objectives-fixtures';
import { ObjectiveFormComponent } from './objective-form.component';

describe('ObjectiveFormComponent', () => {
  let fixture: ComponentFixture<ObjectiveFormComponent>;
  let component: ObjectiveFormComponent;
  let element: HTMLElement;
  let navigate: Mock;
  let http: HttpTestingController;
  let templates: { id: string; name: string; nodeCount: number }[] = [];

  function setUp(route: { id?: string; parent?: string } = {}): void {
    TestBed.configureTestingModule({
      imports: [ObjectiveFormComponent],
      providers: [
        ...provideObjectivesTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(route.id ? { id: route.id } : {}),
              queryParamMap: convertToParamMap(route.parent ? { parent: route.parent } : {}),
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  function render(): void {
    fixture = TestBed.createComponent(ObjectiveFormComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    // A new top-level objective can start from a template: they load with the form.
    if (!component.objectiveId && !component.parentId) {
      http.expectOne('/api/v1/objectives/templates').flush(templates);
    }
  }

  const input = (selector: string): HTMLInputElement => element.querySelector(selector) as HTMLInputElement;
  const type = (control: string, value: string): void => {
    const field = element.querySelector(`[formControlName="${control}"]`) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input'));
    fixture.detectChanges();
  };
  const toggle = (label: string): void => {
    const row = Array.from(element.querySelectorAll<HTMLButtonElement>('app-switch-row button')).find((button) =>
      button.textContent?.includes(label),
    );
    row?.click();
    fixture.detectChanges();
  };
  const pickMode = (label: string): void => {
    const mode = Array.from(element.querySelectorAll<HTMLLabelElement>('.modes .mode')).find((option) =>
      option.textContent?.includes(label),
    );
    mode?.querySelector('input')?.click();
    fixture.detectChanges();
  };
  const submit = async (): Promise<void> => {
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await settleObjectives();
  };
  const errors = (): string[] =>
    Array.from(element.querySelectorAll('.field-error')).map((node) => node.textContent?.trim() ?? '');
  /** Sends what the screen asked for, and answers it. */
  const answerCreate = async (id = 'new'): Promise<unknown> => {
    const request = http.expectOne('/api/v1/objectives');
    expect(request.request.method).toBe('POST');
    request.flush(objectiveDetail({ id }));
    await settleObjectives();
    return request.request.body;
  };

  afterEach(() => {
    http.verify();
    templates = [];
  });

  describe('creating', () => {
    beforeEach(() => {
      setUp();
      render();
    });

    it('asks for the name first, focused, with every option switched off', () => {
      expect(element.querySelector('h1')?.textContent).toBe('Nouvel objectif');
      expect(document.activeElement).toBe(input('[formControlName="title"]'));
      expect(element.querySelectorAll('[role="switch"][aria-checked="true"]').length).toBe(0);
      expect(element.querySelector('.option-body')).toBeNull();
      expect(element.querySelector('.weight')).toBeNull();
    });

    it('refuses a blank name, without calling the API or leaving', async () => {
      type('title', '   ');
      await submit();

      expect(errors()).toEqual(['Donnez un nom à votre objectif.']);
      http.expectNone('/api/v1/objectives');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('creates a simple objective and opens it', async () => {
      type('title', '  Nager  ');
      await submit();

      expect(await answerCreate()).toEqual({
        title: 'Nager',
        category: 'health',
        description: '',
        plan: '',
        completion: 'none',
        startDate: '2026-10-15',
        dueDate: null,
        timelapse: 'off',
        recurrence: 'none',
        reminder: { frequency: 'none', time: '09:00', weekday: 0 },
        dueReminder: 'day-before',
      });
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/objectives', 'new'], { replaceUrl: true });
    });

    it('sends a numeric bar with its settings, and validates them only when on', async () => {
      type('title', 'Nager');
      toggle('Barre de progression');
      expect(element.querySelector('.modes')).not.toBeNull();

      await submit();
      expect(errors()).toEqual(['Indiquez une cible positive et une unité.']);
      http.expectNone('/api/v1/objectives');

      type('unit', 'km');
      type('target', '20');
      type('aggregation', 'max');
      await submit();

      expect(await answerCreate()).toMatchObject({
        completion: 'metric',
        metric: { unit: 'km', target: 20, aggregation: 'max' },
      });
    });

    it('sends a habit, validating its number of days', async () => {
      type('title', 'Méditer');
      toggle('Barre de progression');
      pickMode('Habitude');
      type('habitTargetDays', '0');
      await submit();
      expect(errors()).toEqual(['Choisissez entre 1 et 3660 jours.']);

      type('habitTargetDays', '21');
      await submit();

      const body = (await answerCreate()) as object;
      expect(body).toMatchObject({ completion: 'habit', habitTargetDays: 21 });
      expect(body).not.toHaveProperty('metric');
    });

    it('sends a manual bar with nothing else to fill in', async () => {
      type('title', 'Peindre');
      toggle('Barre de progression');
      pickMode('Pourcentage manuel');
      await submit();

      expect(await answerCreate()).toMatchObject({ completion: 'manual' });
    });

    it('ignores the settings of a bar switched back off', async () => {
      type('title', 'Nager');
      toggle('Barre de progression');
      toggle('Barre de progression');
      await submit();

      const body = (await answerCreate()) as object;
      expect(body).toMatchObject({ completion: 'none' });
      expect(body).not.toHaveProperty('metric');
    });

    it('opens the sub-objectives when the bar is made of them, and sends their names', async () => {
      type('title', 'Voyage');
      toggle('Barre de progression');
      pickMode('Sous-objectifs');
      expect(element.querySelector('[formArrayName="children"]')).not.toBeNull();

      (element.querySelector('.link-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector('.link-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      const fields = element.querySelectorAll<HTMLInputElement>('.child-field input');
      fields[0].value = ' Réserver ';
      fields[0].dispatchEvent(new Event('input'));
      fields[2].value = 'Partir';
      fields[2].dispatchEvent(new Event('input'));
      await submit();

      // The field left blank is not a sub-objective.
      expect(await answerCreate()).toMatchObject({
        completion: 'children',
        children: ['Réserver', 'Partir'],
      });
    });

    it('adds and removes sub-objective fields, always keeping one', () => {
      toggle('Sous-objectifs');
      const remove = () => element.querySelectorAll<HTMLButtonElement>('.child-field button');
      expect(remove()[0].disabled).toBe(true);

      (element.querySelector('.link-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(remove().length).toBe(2);
      expect(remove()[0].disabled).toBe(false);

      remove()[0].click();
      fixture.detectChanges();
      expect(remove().length).toBe(1);

      component.removeChildField(0);
      expect(component.form.controls.children.length).toBe(1);
    });

    it('leaves sub-objectives out when their switch is off', async () => {
      type('title', 'Voyage');
      await submit();

      expect(await answerCreate()).not.toHaveProperty('children');
    });

    it('asks for a deadline before a timelapse bar, in both directions', async () => {
      type('title', 'Voyage');
      toggle('Barre de temps');
      await submit();
      expect(errors()).toEqual(['Une barre de temps a besoin d’une échéance.']);
      http.expectNone('/api/v1/objectives');

      type('dueDate', '2026-12-01');
      await submit();
      expect(await answerCreate()).toMatchObject({ timelapse: 'elapsed', dueDate: '2026-12-01' });
    });

    it('can start the timelapse bar full', async () => {
      type('title', 'Voyage');
      type('dueDate', '2026-12-01');
      toggle('Barre de temps');
      const reversed = Array.from(element.querySelectorAll<HTMLInputElement>('input[value="remaining"]'))[0];
      reversed.click();
      fixture.detectChanges();
      await submit();

      expect(await answerCreate()).toMatchObject({ timelapse: 'remaining' });
    });

    it('refuses a deadline in the past or before the start', async () => {
      type('title', 'Voyage');
      type('dueDate', '2026-10-01');
      await submit();
      expect(errors()).toEqual(['L’échéance ne peut pas être dans le passé.']);

      type('startDate', '2026-11-10');
      type('dueDate', '2026-11-01');
      await submit();
      expect(errors()).toEqual(['L’échéance ne peut pas précéder le début.']);
      http.expectNone('/api/v1/objectives');
    });

    it('sends a weekly reminder', async () => {
      type('title', 'Voyage');
      type('reminderFrequency', 'weekly');
      type('reminderTime', '18:30');
      component.form.controls.reminderWeekday.setValue(3);
      await submit();

      expect(await answerCreate()).toMatchObject({
        reminder: { frequency: 'weekly', time: '18:30', weekday: 3 },
      });
    });

    it('shows a refusal from the API, stays, and lets the user try again', async () => {
      type('title', 'Voyage');
      await submit();
      http.expectOne('/api/v1/objectives').flush({ message: 'Trop de niveaux' }, { status: 400, statusText: 'Bad Request' });
      await settleObjectives();
      fixture.detectChanges();

      expect(errors()).toEqual(['Trop de niveaux']);
      expect(navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
    });

    it('sends one request for a double submit', async () => {
      type('title', 'Voyage');
      const first = component.submit();
      const second = component.submit();
      await Promise.all([second, settleObjectives()]);

      http.expectOne('/api/v1/objectives').flush(objectiveDetail({ id: 'new' }));
      await first;
    });
  });

  describe('repeating', () => {
    beforeEach(() => {
      setUp();
      render();
      type('title', 'Lire');
    });

    it('stays off by default', async () => {
      expect(element.querySelector('input[name="recurrence"]')).toBeNull();
      await submit();

      expect(await answerCreate()).toMatchObject({ recurrence: 'none' });
    });

    it('repeats each month unless told otherwise', async () => {
      toggle('Répéter');
      expect(element.querySelector('.mode.selected')?.textContent).toContain('Chaque mois');
      await submit();

      expect(await answerCreate()).toMatchObject({ recurrence: 'monthly' });
    });

    it('sends the frequency chosen', async () => {
      toggle('Répéter');
      element.querySelectorAll<HTMLInputElement>('input[name="recurrence"]')[0].click();
      fixture.detectChanges();
      await submit();

      expect(await answerCreate()).toMatchObject({ recurrence: 'weekly' });
    });
  });

  describe('starting from a template', () => {
    const pick = (value: string): void => {
      const select = element.querySelector('.from-template select') as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const useIt = () => element.querySelector('.from-template button') as HTMLButtonElement | null;

    it('is not offered without templates', async () => {
      setUp();
      render();
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.from-template')).toBeNull();
    });

    it('makes the objective from it, starting today, and opens it', async () => {
      templates = [{ id: 't1', name: 'Voyage', nodeCount: 3 }];
      setUp();
      render();
      await settleObjectives();
      fixture.detectChanges();
      expect(useIt()).toBeNull();

      pick('t1');
      useIt()?.click();
      const request = http.expectOne('/api/v1/objectives/templates/t1/use');
      expect(request.request.body).toEqual({ startDate: '2026-10-15' });
      expect(component.saving()).toBe(true);
      request.flush(objectiveDetail({ id: 'made' }));
      await settleObjectives();

      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/objectives', 'made'], { replaceUrl: true });
      expect(component.saving()).toBe(false);
    });

    it('stays on the form when it fails, with the reason', async () => {
      templates = [{ id: 't1', name: 'Voyage', nodeCount: 3 }];
      setUp();
      render();
      await settleObjectives();
      fixture.detectChanges();

      pick('t1');
      useIt()?.click();
      http.expectOne('/api/v1/objectives/templates/t1/use').flush({ message: 'Modèle introuvable.' }, { status: 404, statusText: 'Not Found' });
      await settleObjectives();
      fixture.detectChanges();

      expect(navigate).not.toHaveBeenCalled();
      expect(errors()).toEqual(['Modèle introuvable.']);
    });

    it('does nothing without a choice, or twice', async () => {
      templates = [{ id: 't1', name: 'Voyage', nodeCount: 3 }];
      setUp();
      render();
      await settleObjectives();

      await component.startFromTemplate();
      http.expectNone('/api/v1/objectives/templates/t1/use');

      component.templateId.set('t1');
      const first = component.startFromTemplate();
      await component.startFromTemplate();
      http.expectOne('/api/v1/objectives/templates/t1/use').flush(objectiveDetail({ id: 'made' }));
      await first;
    });
  });

  describe('sharing from the start', () => {
    const contact = (id: string, firstName: string) => ({
      id,
      username: firstName.toLowerCase(),
      firstName,
      lastName: '',
      avatarVersion: null,
      friend: true,
      groups: [],
    });
    const pick = (section: number, index: number): void => {
      const pickers = element.querySelectorAll('app-people-picker');
      pickers[section].querySelectorAll<HTMLInputElement>('input')[index].click();
      fixture.detectChanges();
    };

    beforeEach(() => {
      setUp();
      render();
      type('title', 'Épargner');
    });

    const open = async (label: string): Promise<void> => {
      toggle(label);
      http.expectOne('/api/v1/contacts').flush([contact('c1', 'Cyd'), contact('c2', 'Dan')]);
      await settleObjectives();
      fixture.detectChanges();
    };

    it('loads contacts once, when first asked, and says while it does', async () => {
      http.expectNone('/api/v1/contacts');
      toggle('Partager');
      expect(element.querySelector('app-people-picker')?.textContent).toContain('Chargement');
      http.expectOne('/api/v1/contacts').flush([contact('c1', 'Cyd')]);
      await settleObjectives();
      fixture.detectChanges();
      expect(element.querySelector('app-people-picker label')?.textContent).toContain('Cyd');

      toggle('Objectif commun');
      http.expectNone('/api/v1/contacts');
    });

    it('explains what to do without contacts, or if they cannot be loaded', async () => {
      toggle('Partager');
      http.expectOne('/api/v1/contacts').flush(null, { status: 500, statusText: 'Error' });
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('app-people-picker')?.textContent).toContain('Ajoutez des amis');
    });

    it('shares with those picked, as viewers', async () => {
      await open('Partager');
      pick(0, 1);
      await submit();

      expect(await answerCreate()).toMatchObject({ members: [{ userId: 'c2', role: 'viewer' }] });
    });

    it('makes it common with those picked, as contributors', async () => {
      await open('Objectif commun');
      pick(0, 0);
      await submit();

      expect(await answerCreate()).toMatchObject({ members: [{ userId: 'c1', role: 'contributor' }] });
    });

    it('can do both, a person being in one role only', async () => {
      await open('Partager');
      toggle('Objectif commun');
      pick(0, 0);
      pick(0, 1);
      // Cyd moves to the contributors.
      pick(1, 0);
      expect(component.viewers()).toEqual(['c2']);
      expect(component.contributors()).toEqual(['c1']);
      await submit();

      expect(await answerCreate()).toMatchObject({
        members: [
          { userId: 'c2', role: 'viewer' },
          { userId: 'c1', role: 'contributor' },
        ],
      });
    });

    it('unticks someone', async () => {
      await open('Partager');
      pick(0, 0);
      pick(0, 0);

      expect(component.viewers()).toEqual([]);
    });

    it('stays private when nobody is picked, or the switch is back off', async () => {
      await open('Partager');
      pick(0, 0);
      toggle('Partager');
      await submit();

      expect(await answerCreate()).not.toHaveProperty('members');
    });
  });

  describe('creating a sub-objective', () => {
    beforeEach(() => setUp({ parent: 'obj-1' }));

    it('starts in its parent’s category, asks for its weight, and returns to the parent', async () => {
      await openObjective(objectiveDetail({ category: 'finance' }));
      render();
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('h1')?.textContent).toBe('Nouveau sous-objectif');
      // Only a top-level objective repeats.
      expect(Array.from(element.querySelectorAll('[role="switch"]')).map((row) => row.textContent)).not.toContainEqual(
        expect.stringContaining('Répéter'),
      );
      expect(component.form.controls.category.value).toBe('finance');
      expect(element.querySelector('.weight')).not.toBeNull();

      type('title', 'Étape');
      type('weight', '3');
      await submit();

      const body = (await answerCreate('child')) as object;
      expect(body).toMatchObject({ parentId: 'obj-1', weight: 3, category: 'finance' });
      expect(body).not.toHaveProperty('recurrence');
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/objectives', 'obj-1'], { replaceUrl: true });
    });

    it('loads the parent when it is not open yet', async () => {
      render();
      http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail({ category: 'learning' }));
      await settleObjectives();

      expect(component.form.controls.category.value).toBe('learning');
    });

    it('keeps the default category when the parent cannot be read', async () => {
      render();
      http.expectOne('/api/v1/objectives/obj-1').flush(null, { status: 404, statusText: 'Not Found' });
      await settleObjectives();

      expect(component.form.controls.category.value).toBe('health');
    });

    it('validates the weight', async () => {
      await openObjective(objectiveDetail());
      render();
      await settleObjectives();
      fixture.detectChanges();

      type('title', 'Étape');
      type('weight', '0');
      await submit();

      expect(errors()).toEqual(['Choisissez un poids entre 1 et 100.']);
      http.expectNone('/api/v1/objectives');
    });
  });

  describe('editing', () => {
    beforeEach(() => setUp({ id: 'obj-1' }));

    const answerUpdate = async (): Promise<unknown> => {
      const request = http.expectOne('/api/v1/objectives/obj-1');
      expect(request.request.method).toBe('PATCH');
      request.flush(objectiveDetail());
      await settleObjectives();
      return request.request.body;
    };

    it('fills in the objective, with its options on', async () => {
      await openObjective(
        metricDetail({
          category: 'finance',
          description: 'Une fois',
          plan: 'Souvent',
          timelapse: 'remaining',
          dueDate: '2026-12-01',
          startDate: '2026-09-01',
        }),
      );
      render();
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('h1')?.textContent).toBe('Modifier l’objectif');
      expect(component.form.getRawValue()).toMatchObject({
        title: 'Courir 10 km',
        category: 'finance',
        description: 'Une fois',
        plan: 'Souvent',
        completion: 'metric',
        target: 10,
        unit: 'km',
        aggregation: 'max',
        startDate: '2026-09-01',
        dueDate: '2026-12-01',
        timelapse: 'remaining',
      });
      expect(component.barOn()).toBe(true);
      expect(component.timelapseOn()).toBe(true);
      expect(component.recurrenceOn()).toBe(false);
      // Sub-objectives and reminders are managed from the objective itself.
      expect(element.querySelector('[formArrayName="children"]')).toBeNull();
      expect(element.querySelector('[formControlName="reminderFrequency"]')).toBeNull();
    });

    it('saves the changes and returns to the objective', async () => {
      await openObjective(objectiveDetail({ habitTargetDays: 5, completion: 'habit', percent: 0 }));
      render();
      await settleObjectives();
      fixture.detectChanges();

      type('title', 'Renommé');
      await submit();

      expect(await answerUpdate()).toEqual({
        title: 'Renommé',
        category: 'health',
        description: '',
        plan: '',
        completion: 'habit',
        startDate: '2026-10-01',
        dueDate: null,
        timelapse: 'off',
        recurrence: 'none',
        habitTargetDays: 5,
      });
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/objectives', 'obj-1'], { replaceUrl: true });
    });

    it('shows and keeps how it repeats', async () => {
      await openObjective(objectiveDetail({ recurrence: 'yearly' }));
      render();
      await settleObjectives();
      fixture.detectChanges();

      expect(component.recurrenceOn()).toBe(true);
      expect(component.recurrence()).toBe('yearly');
      await submit();

      expect(await answerUpdate()).toMatchObject({ recurrence: 'yearly' });
    });

    it('keeps a deadline that has passed', async () => {
      await openObjective(objectiveDetail({ dueDate: '2026-01-01', startDate: '2025-01-01' }));
      render();
      await settleObjectives();
      fixture.detectChanges();

      await submit();

      expect(await answerUpdate()).toMatchObject({ dueDate: '2026-01-01' });
    });

    it('edits the weight of a sub-objective', async () => {
      await openObjective(objectiveDetail({ parentId: 'parent', weight: 4 }));
      render();
      await settleObjectives();
      fixture.detectChanges();

      expect(component.form.controls.weight.value).toBe(4);
      await submit();

      const body = (await answerUpdate()) as object;
      expect(body).toMatchObject({ weight: 4 });
      expect(body).not.toHaveProperty('recurrence');
    });

    it('stays on the form when saving fails', async () => {
      await openObjective(objectiveDetail());
      render();
      await settleObjectives();
      fixture.detectChanges();

      await submit();
      http.expectOne('/api/v1/objectives/obj-1').flush({ message: 'Interdit' }, { status: 403, statusText: 'Forbidden' });
      await settleObjectives();
      fixture.detectChanges();

      expect(navigate).not.toHaveBeenCalled();
      expect(errors()).toEqual(['Interdit']);
    });

    it('loads the objective when it is not open yet', async () => {
      render();
      http.expectOne('/api/v1/objectives/obj-1').flush(objectiveDetail({ title: 'Chargé' }));
      await settleObjectives();

      expect(component.form.controls.title.value).toBe('Chargé');
    });

    it('explains when the objective is gone', async () => {
      render();
      http.expectOne('/api/v1/objectives/obj-1').flush(null, { status: 404, statusText: 'Not Found' });
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.empty')?.textContent).toContain('n’existe pas');
      expect(element.querySelector('form')).toBeNull();
    });
  });

  it('reads settings from the store', () => {
    setUp();
    render();
    expect(TestBed.inject(ObjectivesStore).settings().defaultDueReminder).toBe('day-before');
  });
});
