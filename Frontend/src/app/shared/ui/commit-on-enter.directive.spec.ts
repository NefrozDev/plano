import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { userEvent } from 'vitest/browser';
import { CommitOnEnterDirective } from './commit-on-enter.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommitOnEnterDirective],
  template: `<input appCommitOnEnter value="Lait" (change)="changes.push($any($event.target).value)" />`,
})
class HostComponent {
  readonly changes: string[] = [];
}

describe('CommitOnEnterDirective', () => {
  let host: HostComponent;
  let input: HTMLInputElement;
  let root: HTMLElement;

  beforeEach(() => {
    const fixture = TestBed.createComponent(HostComponent);
    // In the document, so the input can hold the focus.
    root = fixture.nativeElement as HTMLElement;
    document.body.append(root);
    fixture.detectChanges();
    host = fixture.componentInstance;
    input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    input.focus();
  });

  afterEach(() => root.remove());

  const pressEnter = (init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    input.dispatchEvent(event);
    return event;
  };

  it('leaves the field on Enter, which commits the typed value once', async () => {
    // Real key presses: the browser fires change only for what the user typed.
    await userEvent.fill(input, 'Lait d’avoine');
    await userEvent.keyboard('{Enter}');

    expect(document.activeElement).not.toBe(input);
    expect(host.changes).toEqual(['Lait d’avoine']);
  });

  it('prevents what Enter would otherwise do', () => {
    expect(pressEnter().defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(input);
  });

  it('keeps the field while a word is being composed', () => {
    const event = pressEnter({ isComposing: true });

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(host.changes).toEqual([]);
  });

  it('ignores other keys', () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(input);
    expect(host.changes).toEqual([]);
  });
});
