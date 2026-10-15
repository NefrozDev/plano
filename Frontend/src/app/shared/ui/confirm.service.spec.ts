import { TestBed } from '@angular/core/testing';
import { ConfirmHostComponent } from './confirm-host.component';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let service: ConfirmService;

  function renderHost(): { element: HTMLElement; detect: () => void } {
    const fixture = TestBed.createComponent(ConfirmHostComponent);
    fixture.detectChanges();
    return {
      element: fixture.nativeElement as HTMLElement,
      detect: () => {
        fixture.detectChanges();
        TestBed.flushEffects();
      },
    };
  }

  beforeEach(() => {
    service = TestBed.inject(ConfirmService);
  });

  it('resolves true when the user confirms in the modal', async () => {
    const { element, detect } = renderHost();
    const answer = service.ask({ heading: 'Supprimer ?', message: '« Lait » sera supprimé.', confirmLabel: 'Supprimer', tone: 'danger' });
    detect();

    const dialog = element.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBeTrue();
    expect(dialog.textContent).toContain('« Lait » sera supprimé.');
    expect(dialog.querySelector('.confirm')?.classList).toContain('danger');

    (dialog.querySelector('.confirm') as HTMLButtonElement).click();
    expect(await answer).toBeTrue();
    detect();
    expect(element.querySelector('dialog')).toBeNull();
  });

  it('resolves false on cancel, with default labels', async () => {
    const { element, detect } = renderHost();
    const answer = service.ask({ heading: 'Continuer ?', message: 'Sûr ?' });
    detect();
    expect(element.querySelector('.confirm')?.textContent?.trim()).toBe('Confirmer');

    (element.querySelector('.cancel') as HTMLButtonElement).click();
    expect(await answer).toBeFalse();
  });

  it('cancels a pending question when a new one is asked, and ignores stray settles', async () => {
    const first = service.ask({ heading: 'A', message: 'a' });
    const second = service.ask({ heading: 'B', message: 'b' });

    expect(await first).toBeFalse();
    expect(service.request()?.heading).toBe('B');
    service.settle(true);
    service.settle(false);
    expect(await second).toBeTrue();
  });
});
