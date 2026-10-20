import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ToastComponent } from './toast.component';

/** Host owning the message, clearing it on dismissal like real parents do. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToastComponent],
  template: `<app-toast [message]="message()" [duration]="1000" (dismissed)="message.set('')" />`,
})
class HostComponent {
  readonly message = signal('');
}

describe('ToastComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;

  // Effects (which start the countdown) run during change detection.
  const render = (): void => {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  it('keeps an empty live region until there is a message', () => {
    render();

    expect(element.querySelector('[role="status"]')).not.toBeNull();
    expect(element.querySelector('.toast')).toBeNull();
  });

  it('shows the message and dismisses it after the duration', fakeAsync(() => {
    host.message.set('Nom modifié.');
    render();
    expect(element.querySelector('.toast .text')?.textContent).toBe('Nom modifié.');

    tick(999);
    expect(host.message()).toBe('Nom modifié.');
    tick(1);
    render();
    expect(host.message()).toBe('');
    expect(element.querySelector('.toast')).toBeNull();
  }));

  it('restarts the countdown when a new message replaces the current one', fakeAsync(() => {
    host.message.set('Nom modifié.');
    render();
    tick(800);

    host.message.set('Nouveau code généré.');
    render();
    tick(800);
    expect(host.message()).toBe('Nouveau code généré.');

    tick(200);
    expect(host.message()).toBe('');
  }));

  it('closes early when the toast itself is clicked or tapped', fakeAsync(() => {
    host.message.set('Membre retiré du groupe.');
    render();

    const toast = element.querySelector('.toast') as HTMLButtonElement;
    // No separate close icon: the whole toast is one button.
    expect(toast.tagName).toBe('BUTTON');
    expect(toast.querySelectorAll('button').length).toBe(0);
    toast.click();
    render();

    expect(element.querySelector('.toast')).toBeNull();
    // The pending timer was cancelled with the message: nothing left to flush.
    tick(1000);
    expect(host.message()).toBe('');
  }));
});
