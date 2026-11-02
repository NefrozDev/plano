import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { ObjectiveRemovalService } from './objective-removal.service';
import { provideObjectivesTesting, settleObjectives } from './objectives.testing';
import { objectiveSummary } from './testing/objectives-fixtures';

describe('ObjectiveRemovalService', () => {
  let removal: ObjectiveRemovalService;
  let http: HttpTestingController;
  let ask: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideObjectivesTesting() });
    removal = TestBed.inject(ObjectiveRemovalService);
    http = TestBed.inject(HttpTestingController);
    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
  });

  afterEach(() => http.verify());

  /** Answers the DELETE and returns its query string. */
  async function deleted(removing: Promise<boolean>): Promise<string> {
    await settleObjectives();
    const request = http.expectOne((req) => req.method === 'DELETE' && req.url === '/api/v1/objectives/obj-1');
    request.flush(null);
    expect(await removing).toBe(true);
    return request.request.params.toString();
  }

  it('deletes nothing when the first question is declined', async () => {
    ask.mockResolvedValueOnce(false);

    expect(await removal.remove(objectiveSummary({ linkedListCount: 2 }), 'Sûr ?')).toBe(false);

    expect(ask).toHaveBeenCalledExactlyOnceWith({
      heading: 'Supprimer l’objectif ?',
      message: 'Sûr ?',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    http.expectNone((req) => req.method === 'DELETE');
  });

  it('asks only once, and keeps lists out of it, when none is linked', async () => {
    ask.mockResolvedValueOnce(true);

    expect(await deleted(removal.remove(objectiveSummary({ linkedListCount: 0 }), 'Sûr ?'))).toBe('');
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('deletes the linked lists too when asked', async () => {
    ask.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    expect(await deleted(removal.remove(objectiveSummary({ title: 'Voyage', linkedListCount: 2 }), 'Sûr ?'))).toBe(
      'deleteLists=true',
    );
    expect(ask).toHaveBeenLastCalledWith({
      heading: 'Supprimer aussi ses listes ?',
      message: '2 listes sont liées à « Voyage ». Sinon, elles restent dans vos listes.',
      confirmLabel: 'Supprimer les listes',
      cancelLabel: 'Garder les listes',
      tone: 'danger',
    });
  });

  it('keeps the list when refused, or when the second question is dismissed', async () => {
    ask.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(await deleted(removal.remove(objectiveSummary({ title: 'Voyage', linkedListCount: 1 }), 'Sûr ?'))).toBe('');
    expect(ask).toHaveBeenLastCalledWith({
      heading: 'Supprimer aussi sa liste ?',
      message: 'Une liste est liée à « Voyage ». Sinon, elle reste dans vos listes.',
      confirmLabel: 'Supprimer la liste',
      cancelLabel: 'Garder la liste',
      tone: 'danger',
    });
  });

  it('says what goes with an open objective', () => {
    expect(removal.messageFor({ title: 'Voyage', descendantCount: 0 })).toBe('« Voyage » sera supprimé définitivement.');
    expect(removal.messageFor({ title: 'Voyage', descendantCount: 1 })).toBe(
      '« Voyage » et son sous-objectif seront supprimés définitivement.',
    );
    expect(removal.messageFor({ title: 'Voyage', descendantCount: 3 })).toBe(
      '« Voyage » et ses 3 sous-objectifs seront supprimés définitivement.',
    );
  });
});
