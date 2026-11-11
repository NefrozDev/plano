import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Commits a field saved on `change` when Enter is pressed outside a form: it leaves the field, which
 * fires `change` once, as blurring does, and closes the on-screen keyboard. `<input appCommitOnEnter (change)="…" />`
 */
@Directive({
  selector: 'input[appCommitOnEnter]',
  host: { '(keydown.enter)': 'commit($event)' },
})
export class CommitOnEnterDirective {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);

  commit(event: Event): void {
    // Enter also confirms a word being composed (IME, dictation): that is not a commit.
    if ((event as KeyboardEvent).isComposing) return;
    event.preventDefault();
    this.element.nativeElement.blur();
  }
}
