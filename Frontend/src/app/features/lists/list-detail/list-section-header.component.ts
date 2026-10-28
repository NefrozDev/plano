import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { SwipeToDelete } from './swipe-to-delete';

/**
 * Title of an open section. Editors tap the name to rename it, fold the section
 * with the chevron and swipe left to delete it; viewers tap the name to fold it.
 */
@Component({
  selector: 'app-list-section-header',
  imports: [AutofocusDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header-shell" [class.revealed]="swipe.offset() < 0">
      @if (editable()) {
        <button
          class="delete-section"
          type="button"
          [attr.aria-label]="'Supprimer la section ' + name()"
          (click)="remove.emit()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>
        </button>
      }
      <!-- Clicks from its buttons bubble here, so a click ending a swipe can be swallowed. -->
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div
        class="header"
        [style.transform]="'translateX(' + swipe.offset() + 'px)'"
        (click)="handleClick($event)"
        (pointerdown)="startSwipe($event)"
        (pointermove)="swipe.move($event)"
        (pointerup)="swipe.finish()"
        (pointercancel)="swipe.finish()"
      >
        @if (editing()) {
          <input
            appAutofocus
            class="name-input"
            type="text"
            maxlength="80"
            aria-label="Nom de la section"
            [value]="draft()"
            (input)="draft.set($any($event.target).value)"
            (keydown.enter)="$event.preventDefault(); commit()"
            (keydown.escape)="cancel()"
            (blur)="commit()"
          />
        } @else if (editable()) {
          <button class="section-title" type="button" [attr.aria-label]="'Renommer la section ' + name()">{{ name() }}</button>
          <button class="collapse" type="button" [attr.aria-expanded]="true" [attr.aria-label]="'Replier la section ' + name()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
        } @else {
          <button class="section-title" type="button" [attr.aria-expanded]="true">{{ name() }}</button>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .header-shell { position: relative; overflow: hidden; margin: .3rem 0 .55rem; border-radius: .5rem; }
    .header { position: relative; z-index: 1; display: flex; min-height: 2rem; gap: .4rem; align-items: center; touch-action: pan-y; transition: transform 180ms ease; }
    .header-shell.revealed .header { transition: transform 120ms ease-out; }
    .delete-section { position: absolute; top: 0; right: 0; bottom: 0; display: grid; width: 3.65rem; place-items: center; border: 0; background: #d92d20; color: white; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 100ms ease; }
    .header-shell.revealed .delete-section { opacity: 1; pointer-events: auto; }
    svg { width: 1.3rem; height: 1.3rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
    .section-title { flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--color-text); cursor: pointer; font-size: .88rem; font-weight: 700; overflow-wrap: anywhere; text-align: left; }
    .collapse { display: grid; width: 2rem; height: 2rem; flex: none; padding: .35rem; place-items: center; border: 0; border-radius: .5rem; background: transparent; color: #6b7385; cursor: pointer; }
    .name-input { flex: 1; min-width: 0; min-height: 2rem; padding: 0 .45rem; border: 1px solid var(--color-primary); border-radius: .45rem; background: white; color: var(--color-text); font: inherit; font-size: .88rem; font-weight: 700; }
  `,
})
export class ListSectionHeaderComponent {
  readonly name = input.required<string>();
  /** Owner and editors; viewers only fold the section. */
  readonly editable = input(false);

  readonly renamed = output<string>();
  readonly collapse = output<void>();
  readonly remove = output<void>();

  readonly editing = signal(false);
  readonly draft = signal('');
  readonly swipe = new SwipeToDelete(() => this.remove.emit());

  startSwipe(event: PointerEvent): void {
    if (!this.editable() || this.editing()) return;
    if ((event.target as HTMLElement).closest('.collapse')) return;
    this.swipe.start(event);
  }

  handleClick(event: MouseEvent): void {
    if (this.swipe.swallowClick(event)) return;
    const button = (event.target as HTMLElement).closest('button');
    if (button?.classList.contains('collapse')) {
      this.collapse.emit();
    } else if (button?.classList.contains('section-title')) {
      if (this.editable()) this.beginEditing();
      else this.collapse.emit();
    }
  }

  beginEditing(): void {
    this.draft.set(this.name());
    this.editing.set(true);
  }

  /** Enter and blur both land here: the second call finds editing already over. */
  commit(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    const name = this.draft().trim();
    if (name && name !== this.name()) this.renamed.emit(name);
  }

  cancel(): void {
    this.editing.set(false);
  }
}
