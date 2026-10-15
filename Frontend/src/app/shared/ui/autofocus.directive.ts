import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** Focuses its element once rendered, e.g. an input revealed by `@if`: `<input appAutofocus />`. */
@Directive({
  selector: '[appAutofocus]',
  standalone: true,
})
export class AutofocusDirective {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => element.nativeElement.focus());
  }
}
