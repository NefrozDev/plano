import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalDialogComponent } from './modal-dialog.component';

/** Host owning the open state, the way real parents use the modal. */
@Component({
  standalone: true,
  imports: [ModalDialogComponent],
  template: `
    <app-modal-dialog heading="Renommer" [open]="open()" (closed)="onClosed()">
      <svg dialog-icon viewBox="0 0 24 24"><path d="M4 20h4" /></svg>
      <p class="body">Contenu</p>
    </app-modal-dialog>
    <app-modal-dialog heading="Second" />
  `,
})
class HostComponent {
  readonly open = signal(false);
  closedCount = 0;

  onClosed(): void {
    this.closedCount += 1;
    this.open.set(false);
  }
}

describe('ModalDialogComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let dialog: HTMLDialogElement;

  /**
   * The native close event is queued on another task source than timers, so
   * tests wait for the event itself rather than for a setTimeout.
   */
  const closeEvent = (): Promise<void> =>
    new Promise((resolve) => dialog.addEventListener('close', () => resolve(), { once: true }));
  const render = (): void => {
    fixture.detectChanges();
    TestBed.flushEffects();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    render();
    dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog') as HTMLDialogElement;
  });

  it('opens as a labelled modal and closes when the parent says so', async () => {
    expect(dialog.open).toBeFalse();

    host.open.set(true);
    render();
    expect(dialog.open).toBeTrue();
    // showModal() (not show()) puts the dialog in the top layer with a backdrop.
    expect(dialog.matches(':modal')).toBeTrue();
    const title = dialog.querySelector('h2') as HTMLElement;
    expect(title.textContent).toBe('Renommer');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(dialog.querySelector('.body')?.textContent).toBe('Contenu');

    const closing = closeEvent();
    host.open.set(false);
    render();
    expect(dialog.open).toBeFalse();
    await closing;
    expect(host.closedCount).toBe(1);
  });

  it('closes on a backdrop click but not on a click inside the panel', async () => {
    host.open.set(true);
    render();

    (dialog.querySelector('.body') as HTMLElement).click();
    expect(dialog.open).toBeTrue();

    const closing = closeEvent();
    dialog.click();
    expect(dialog.open).toBeFalse();
    await closing;
    expect(host.open()).toBeFalse();
  });

  it('reports a native close (e.g. Escape) to the parent', async () => {
    host.open.set(true);
    render();

    const closing = closeEvent();
    dialog.close();
    await closing;

    expect(host.closedCount).toBe(1);
    expect(host.open()).toBeFalse();
  });

  it('gives every dialog its own heading id and hides an empty icon slot', () => {
    const titles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2'));

    expect(titles[0].id).not.toBe(titles[1].id);
    expect(getComputedStyle(titles[1].previousElementSibling as Element).display).toBe('none');
  });
});
