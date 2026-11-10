import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ObjectiveActivityEntry, ObjectiveCommentEntry, ObjectiveDetail } from '@plano/common';
import {
  openObjective,
  provideObjectiveContext,
  provideObjectivesTesting,
  provideSignedIn,
  settleObjectives,
} from '../../objectives.testing';
import { ME, OTHER, objectiveDetail } from '../../testing/objectives-fixtures';
import { ObjectiveActivityComponent } from './objective-activity.component';

const comment = (changes: Partial<ObjectiveCommentEntry> = {}): ObjectiveCommentEntry => ({
  id: 'c1',
  body: 'Courage',
  author: { id: ME, name: 'Ada Lovelace', avatarVersion: null },
  createdAt: '2026-10-14T09:30:00',
  ...changes,
});
const entry = (changes: Partial<ObjectiveActivityEntry> = {}): ObjectiveActivityEntry => ({
  id: 'a1',
  kind: 'created',
  detail: '',
  actor: { id: ME, name: 'Ada Lovelace', avatarVersion: null },
  objectiveId: 'obj-1',
  objectiveTitle: 'Courir',
  createdAt: '2026-10-14T09:30:00',
  ...changes,
});

describe('ObjectiveActivityComponent', () => {
  let fixture: ComponentFixture<ObjectiveActivityComponent>;
  let component: ObjectiveActivityComponent;
  let element: HTMLElement;
  let http: HttpTestingController;

  /** Answers what the screen loads for the open objective. */
  const flushLoad = async (comments: ObjectiveCommentEntry[] = [], history: ObjectiveActivityEntry[] = []) => {
    http.expectOne('/api/v1/objectives/obj-1/comments').flush(comments);
    http.expectOne('/api/v1/objectives/obj-1/activity').flush(history);
    await settleObjectives();
    fixture.detectChanges();
  };

  async function setUp(
    comments: ObjectiveCommentEntry[] = [],
    history: ObjectiveActivityEntry[] = [],
    detail: ObjectiveDetail = objectiveDetail(),
  ): Promise<void> {
    await openObjective(detail);
    fixture = TestBed.createComponent(ObjectiveActivityComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await flushLoad(comments, history);
  }

  const write = (text: string): void => {
    (element.querySelector('textarea') as HTMLTextAreaElement).value = text;
    (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectiveActivityComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('obj-1'), provideSignedIn()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('says when there is nothing yet', async () => {
    await setUp();

    const empty = element.querySelectorAll('.empty');
    expect(empty[0].textContent).toContain('Aucun commentaire');
    expect(empty[1].textContent).toContain('Rien');
  });

  describe('history', () => {
    const lines = () => Array.from(element.querySelectorAll('.history li')).map((line) => line.textContent?.replace(/\s+/g, ' ').trim());

    it('says who did what and when', async () => {
      await setUp([], [entry({ kind: 'session', detail: '3 km · Sortie' })]);

      expect(lines()[0]).toContain('Ada Lovelace a ajouté une séance : 3 km · Sortie');
      expect(element.querySelector('.history small')?.textContent).toBe('14 oct. 2026 à 09:30');
    });

    it('says what a line from below was on', async () => {
      await setUp([], [entry({ objectiveId: 'child', objectiveTitle: 'Réserver', kind: 'completed' })]);

      expect(lines()[0]).toContain('a terminé · Réserver');
    });

    it('names no one for what happened by itself, or an account since deleted', async () => {
      await setUp([], [entry({ actor: null, kind: 'restarted' })]);

      expect(lines()[0]).toContain('Plano a relancé une nouvelle période');
    });
  });

  describe('comments', () => {
    const shown = () => Array.from(element.querySelectorAll('.comments li .body')).map((node) => node.textContent);

    it('shows them with their author and date', async () => {
      await setUp([comment()]);

      expect(shown()).toEqual(['Courage']);
      expect(element.querySelector('.meta b')?.textContent).toBe('Ada Lovelace');
      expect(element.querySelector('.meta small')?.textContent).toBe('14 oct. 2026 à 09:30');
    });

    it('shows the words of an account since deleted', async () => {
      await setUp([comment({ author: null })]);

      expect(element.querySelector('.meta b')?.textContent).toBe('Compte supprimé');
    });

    it('sends a trimmed comment, shows it and empties the field', async () => {
      await setUp();

      write('  Bravo  ');
      const request = http.expectOne('/api/v1/objectives/obj-1/comments');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ body: 'Bravo' });
      request.flush(comment({ body: 'Bravo' }));
      await settleObjectives();
      fixture.detectChanges();

      expect(shown()).toEqual(['Bravo']);
      expect((element.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    });

    it('sends nothing blank, and one for a double submit', async () => {
      await setUp();

      write('   ');
      http.expectNone({ method: 'POST', url: '/api/v1/objectives/obj-1/comments' });

      write('Bravo');
      write('Bravo');
      const [request, ...others] = http.match({ method: 'POST', url: '/api/v1/objectives/obj-1/comments' });
      expect(others).toEqual([]);
      request.flush(comment());
      await settleObjectives();
    });

    it('keeps what was written when sending fails, and says why', async () => {
      await setUp();

      write('Bravo');
      http
        .expectOne('/api/v1/objectives/obj-1/comments')
        .flush({ errorCode: 'objectives.viewOnly' }, { status: 400, statusText: 'Bad Request' });
      await settleObjectives();
      fixture.detectChanges();

      expect(element.querySelector('.field-error')?.textContent).toBe('Vous pouvez seulement consulter cet objectif.');
      expect((element.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Bravo');
      expect(component.sending()).toBe(false);
    });

    it('lets people remove their own, not others’', async () => {
      await setUp(
        [comment(), comment({ id: 'c2', author: { id: OTHER, name: 'Bob Martin', avatarVersion: null } })],
        [],
        objectiveDetail({ role: 'viewer' }),
      );
      const items = element.querySelectorAll('.comments li');
      expect(items[0].querySelector('button')).not.toBeNull();
      expect(items[1].querySelector('button')).toBeNull();

      (items[0].querySelector('button') as HTMLButtonElement).click();
      const request = http.expectOne('/api/v1/objectives/obj-1/comments/c1');
      expect(request.request.method).toBe('DELETE');
      request.flush(null);
      await settleObjectives();
      fixture.detectChanges();

      expect(shown()).toEqual(['Courage']);
      expect(component.comments().map(({ id }) => id)).toEqual(['c2']);
    });

    it('lets the owner remove anyone’s', async () => {
      await setUp([comment({ author: { id: OTHER, name: 'Bob Martin', avatarVersion: null } })]);

      expect(element.querySelector('.comments button')).not.toBeNull();
    });

    it('keeps a comment that could not be removed', async () => {
      await setUp([comment()]);

      (element.querySelector('.comments button') as HTMLButtonElement).click();
      http.expectOne('/api/v1/objectives/obj-1/comments/c1').flush(null, { status: 500, statusText: 'Error' });
      await settleObjectives();
      fixture.detectChanges();

      expect(shown()).toEqual(['Courage']);
      expect(element.querySelector('.field-error')).not.toBeNull();
    });
  });

  it('reloads when the objective changes', async () => {
    await setUp();

    await openObjective(objectiveDetail({ title: 'Changé' }));
    fixture.detectChanges();

    await flushLoad([comment()], []);
    expect(element.querySelector('.body')?.textContent).toBe('Courage');
  });

  it('shows why it could not load', async () => {
    await openObjective(objectiveDetail());
    fixture = TestBed.createComponent(ObjectiveActivityComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    http.expectOne('/api/v1/objectives/obj-1/comments').flush(null, { status: 500, statusText: 'Error' });
    http.expectOne('/api/v1/objectives/obj-1/activity').flush([]);
    await settleObjectives();
    fixture.detectChanges();

    expect(element.querySelector('.field-error')).not.toBeNull();
  });
});

describe('ObjectiveActivityComponent without an objective', () => {
  it('loads and sends nothing', async () => {
    TestBed.configureTestingModule({
      imports: [ObjectiveActivityComponent],
      providers: [...provideObjectivesTesting(), provideObjectiveContext('gone'), provideSignedIn()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ObjectiveActivityComponent);
    fixture.detectChanges();
    const input = document.createElement('textarea');
    input.value = 'Fantôme';

    await fixture.componentInstance.send(input);
    await fixture.componentInstance.remove('c1');

    http.verify();
    expect((fixture.nativeElement as HTMLElement).querySelector('section')).toBeNull();
  });
});
