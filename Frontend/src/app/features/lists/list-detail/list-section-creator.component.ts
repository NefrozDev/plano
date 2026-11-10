import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AutofocusDirective } from '../../../shared/ui/autofocus.directive';
import { LIST_COLOR_CHOICES } from './list-options';

export interface NewSection {
  name: string;
  color: string;
}

/** Bottom sheet asking for a section name and colour. */
@Component({
  selector: 'app-list-section-creator',
  imports: [AutofocusDirective, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="section-sheet-layer">
      <button class="sheet-backdrop" type="button" [attr.aria-label]="'lists.sectionCreator.close' | transloco" (click)="closed.emit()"></button>
      <section class="section-sheet" aria-labelledby="section-sheet-title">
        <header>
          <button type="button" [attr.aria-label]="'common.cancel' | transloco" (click)="closed.emit()">×</button>
          <h2 id="section-sheet-title">{{ 'lists.sectionCreator.heading' | transloco }}</h2>
          <button class="save-section" type="button" [attr.aria-label]="'lists.sectionCreator.save' | transloco" [disabled]="!name().trim()" (click)="save()">✓</button>
        </header>
        <label>
          <span>{{ 'lists.sectionCreator.name' | transloco }}</span>
          <input
            appAutofocus
            type="text"
            [placeholder]="'lists.sectionCreator.placeholder' | transloco"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
            (keydown.enter)="$event.preventDefault(); save()"
          />
        </label>
        <fieldset>
          <legend>{{ 'lists.editor.color' | transloco }}</legend>
          <div>
            @for (choice of colorChoices; track choice) {
              <button
                type="button"
                [class.selected]="color() === choice"
                [style.background]="choice"
                [attr.aria-label]="'lists.editor.pickColor' | transloco: { color: choice }"
                [attr.aria-pressed]="color() === choice"
                (click)="color.set(choice)"
              ><span aria-hidden="true">✓</span></button>
            }
          </div>
        </fieldset>
      </section>
    </div>
  `,
  styles: `:host { display: contents; }`,
})
export class ListSectionCreatorComponent {
  readonly create = output<NewSection>();
  readonly closed = output<void>();

  readonly colorChoices = LIST_COLOR_CHOICES;
  readonly name = signal('');
  readonly color = signal(LIST_COLOR_CHOICES[0]);

  save(): void {
    const name = this.name().trim();
    if (name) this.create.emit({ name, color: this.color() });
  }
}
