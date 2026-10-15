import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import type { ListIcon, PlanoList } from '@plano/common';
import { LIST_COLOR_CHOICES, LIST_ICON_CHOICES } from './list-options';

export interface ListEdits {
  name: string;
  icon: ListIcon;
  color: string;
  description: string;
}

/** Full-screen list editor working on drafts: nothing changes until save. */
@Component({
  selector: 'app-list-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-editor.component.html',
  styles: `
    :host { display: contents; }
    .avatar { display: grid; width: 1.85rem; height: 1.85rem; margin-left: -.25rem; place-items: center; border: 2px solid white; border-radius: 50%; color: white; font-size: .66rem; font-weight: 750; }
    .avatar:first-child { margin-left: 0; }
    .avatar-one { background: #915c43; }
    .avatar-two { background: #cb7460; }
    .avatar-three { background: #35485d; }
  `,
})
export class ListEditorComponent implements OnInit {
  readonly list = input.required<PlanoList>();
  readonly description = input('');

  readonly save = output<ListEdits>();
  readonly close = output<void>();

  readonly iconChoices = LIST_ICON_CHOICES;
  readonly colorChoices = LIST_COLOR_CHOICES;
  readonly draftName = signal('');
  readonly draftIcon = signal<ListIcon>('cart');
  readonly draftColor = signal(LIST_COLOR_CHOICES[0]);
  readonly draftDescription = signal('');

  /** Inputs are only set once the component is created, hence ngOnInit rather than field initializers. */
  ngOnInit(): void {
    const list = this.list();
    this.draftName.set(list.name);
    this.draftIcon.set(list.icon);
    this.draftColor.set(list.color);
    this.draftDescription.set(this.description());
  }

  submit(): void {
    this.save.emit({
      // A blank name keeps the current one.
      name: this.draftName().trim() || this.list().name,
      icon: this.draftIcon(),
      color: this.draftColor(),
      description: this.draftDescription(),
    });
  }
}
