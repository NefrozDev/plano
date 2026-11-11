import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AutoGrowDirective } from '../../../shared/ui/auto-grow.directive';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { SwipeToDelete } from '../../../shared/ui/swipe-to-delete';
import { LIST_COLOR_CHOICES } from './list-options';

/**
 * Title of an open section. Editors tap the name to edit it (its name, on as
 * many lines as it needs, and its colour), fold the section with the chevron
 * and swipe left to delete it; viewers tap the name to fold it.
 */
@Component({
  selector: 'app-list-section-header',
  imports: [AutoGrowDirective, AutofocusDirective, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header-shell" [class.revealed]="swipe.offset() < 0" [class.editing]="editing()">
      @if (editable()) {
        <button
          class="delete-section"
          type="button"
          [attr.aria-label]="'lists.section.delete' | transloco: { name: name() }"
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
        (wheel)="wheelSwipe($event)"
      >
        @if (editing()) {
          <!-- Left as a whole: moving from the name to a colour keeps it open. -->
          <div class="editor" (focusout)="leave($event)">
            <!-- Wraps like the title it edits; Enter saves, there are no line breaks. -->
            <textarea
              appAutofocus
              appAutoGrow
              class="name-input"
              rows="1"
              maxlength="80"
              [attr.aria-label]="'lists.sectionCreator.name' | transloco"
              [value]="draft()"
              (input)="draft.set($any($event.target).value)"
              (keydown.enter)="$event.preventDefault(); commit()"
              (keydown.escape)="cancel()"
            ></textarea>
            <div class="colors" role="group" [attr.aria-label]="'lists.editor.color' | transloco">
              @for (choice of colorChoices; track choice) {
                <!-- Keeps the focus in the name: a tap on a colour must not close the editor before its click. -->
                <button
                  class="color"
                  type="button"
                  [class.selected]="color() === choice"
                  [style.background]="choice"
                  [attr.aria-label]="'lists.editor.pickColor' | transloco: { color: choice }"
                  [attr.aria-pressed]="color() === choice"
                  (mousedown)="$event.preventDefault()"
                  (click)="recoloured.emit(choice)"
                  (keydown.escape)="cancel()"
                ><span aria-hidden="true">✓</span></button>
              }
            </div>
          </div>
        } @else if (editable()) {
          <button class="section-title" type="button" [attr.aria-label]="'lists.section.edit' | transloco: { name: name() }">{{ name() }}</button>
          <button class="collapse" type="button" [attr.aria-expanded]="true" [attr.aria-label]="'lists.section.collapse' | transloco: { name: name() }">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <button
            class="drag-handle"
            type="button"
            [attr.aria-label]="'lists.moveSection' | transloco: { name: name() }"
            (click)="$event.preventDefault()"
            (pointerdown)="startDrag($event)"
          >⠿</button>
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
    .collapse { display: grid; width: 2rem; height: 2rem; flex: none; padding: .35rem; place-items: center; border: 0; border-radius: .5rem; background: transparent; color: var(--color-text-muted); cursor: pointer; }
    /* The focus ring of the fields sits outside the box of the shell. */
    .header-shell.editing { overflow: visible; }
    .editor { display: grid; flex: 1; min-width: 0; gap: .55rem; }
    /* Like the title, so the text wraps where the title will. */
    .name-input { display: block; width: 100%; min-height: 2rem; box-sizing: border-box; padding: .32rem .45rem; overflow: hidden; border: 1px solid var(--color-primary); border-radius: .45rem; background: white; color: var(--color-text); font: inherit; font-size: .88rem; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; resize: none; }
    .colors { display: flex; flex-wrap: wrap; gap: .6rem; padding: 0 .2rem .2rem; }
    .color { display: grid; width: 1.8rem; height: 1.8rem; padding: 0; place-items: center; border: 2px solid white; border-radius: 50%; color: white; cursor: pointer; font-size: .8rem; }
    .color span { visibility: hidden; }
    .color.selected { box-shadow: 0 0 0 .15rem #586174; }
    .color.selected span { visibility: visible; }
  `,
})
export class ListSectionHeaderComponent {
  readonly name = input.required<string>();
  /** The colour of the section, to mark it among the choices. */
  readonly color = input('');
  /** Owner and editors; viewers only fold the section. */
  readonly editable = input(false);

  readonly renamed = output<string>();
  /** A colour was picked: saved at once, the editor stays open. */
  readonly recoloured = output<string>();
  readonly collapse = output<void>();
  readonly remove = output<void>();
  readonly dragStart = output<void>();

  readonly colorChoices = LIST_COLOR_CHOICES;
  readonly editing = signal(false);
  readonly draft = signal('');
  readonly swipe = new SwipeToDelete(() => this.remove.emit());

  startSwipe(event: PointerEvent): void {
    if (!this.editable() || this.editing()) return;
    if ((event.target as HTMLElement).closest('.collapse, .drag-handle')) return;
    this.swipe.start(event);
  }

  wheelSwipe(event: WheelEvent): void {
    if (this.editable() && !this.editing()) this.swipe.wheel(event);
  }

  /** The parent tracks the drag across sections, like entry drags. */
  startDrag(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart.emit();
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

  /** The focus left the editor (not just the name for a colour): save. */
  leave(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!(event.currentTarget as HTMLElement).contains(next)) this.commit();
  }

  /** Enter and leaving both land here: the second call finds editing already over. */
  commit(): void {
    if (!this.editing()) return;
    this.editing.set(false);
    // A pasted line break becomes a space: a title is one line of text.
    const name = this.draft().replace(/\s+/g, ' ').trim();
    if (name && name !== this.name()) this.renamed.emit(name);
  }

  cancel(): void {
    this.editing.set(false);
  }
}
