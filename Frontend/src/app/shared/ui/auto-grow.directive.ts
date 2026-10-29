import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Makes a textarea as tall as its text, so long text wraps onto new lines
 * instead of scrolling sideways: `<textarea appAutoGrow rows="1">`.
 */
@Directive({
  selector: 'textarea[appAutoGrow]',
  host: { '(input)': 'resize()' },
})
export class AutoGrowDirective {
  private readonly element = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;

  constructor() {
    afterNextRender(() => this.resize());
  }

  resize(): void {
    // Reset first, or the height could only ever grow.
    this.element.style.height = 'auto';
    this.element.style.height = `${this.element.scrollHeight}px`;
  }
}
