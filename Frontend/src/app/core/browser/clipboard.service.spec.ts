import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  let service: ClipboardService;

  beforeEach(() => {
    service = TestBed.inject(ClipboardService);
  });

  it('copies the text and reports success', async () => {
    const writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();

    await expectAsync(service.copy('ABC')).toBeResolvedTo(true);
    expect(writeText).toHaveBeenCalledOnceWith('ABC');
  });

  it('reports failure instead of throwing when the copy is refused', async () => {
    spyOn(navigator.clipboard, 'writeText').and.rejectWith(new Error('denied'));

    await expectAsync(service.copy('ABC')).toBeResolvedTo(false);
  });
});
