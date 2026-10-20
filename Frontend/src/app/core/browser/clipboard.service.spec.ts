import { TestBed } from '@angular/core/testing';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  let service: ClipboardService;

  beforeEach(() => {
    service = TestBed.inject(ClipboardService);
  });

  it('copies the text and reports success', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    await expect(service.copy('ABC')).resolves.toEqual(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('ABC');
  });

  it('reports failure instead of throwing when the copy is refused', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));

    await expect(service.copy('ABC')).resolves.toEqual(false);
  });
});
