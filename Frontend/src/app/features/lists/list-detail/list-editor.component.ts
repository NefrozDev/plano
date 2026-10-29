import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  afterNextRender,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { ListDetail, ListIcon } from '@plano/common';
import type { Person } from '../../../core/people/people';
import { AvatarStackComponent } from '../../../shared/ui/avatar-stack.component';
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
  imports: [AvatarStackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-editor.component.html',
  styles: `
    :host { display: contents; }
    .sharing-row app-avatar-stack { --avatar-size: 1.85rem; }
  `,
})
export class ListEditorComponent implements OnInit {
  readonly list = input.required<ListDetail>();
  /** Avatars of the people with access. */
  readonly people = input<readonly Person[]>([]);

  readonly save = output<ListEdits>();
  /** Carries the drafts, so inviting someone does not lose an unsaved name. */
  readonly share = output<ListEdits>();
  readonly delete = output<void>();
  readonly closed = output<void>();

  readonly iconChoices = LIST_ICON_CHOICES;
  readonly colorChoices = LIST_COLOR_CHOICES;
  readonly draftName = signal('');
  readonly draftIcon = signal<ListIcon>('cart');
  readonly draftColor = signal(LIST_COLOR_CHOICES[0]);
  readonly draftDescription = signal('');
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    // Ready to type: a new list's placeholder name is selected, so typing replaces it.
    afterNextRender(() => {
      const input = this.nameInput().nativeElement;
      input.focus();
      input.select();
    });
  }

  /** Inputs are only set once the component is created, hence ngOnInit rather than field initializers. */
  ngOnInit(): void {
    const list = this.list();
    this.draftName.set(list.name);
    this.draftIcon.set(list.icon);
    this.draftColor.set(list.color);
    this.draftDescription.set(list.description);
  }

  submit(): void {
    this.save.emit(this.edits());
  }

  openSharing(): void {
    this.share.emit(this.edits());
  }

  private edits(): ListEdits {
    return {
      // A blank name keeps the current one.
      name: this.draftName().trim() || this.list().name,
      icon: this.draftIcon(),
      color: this.draftColor(),
      description: this.draftDescription(),
    };
  }
}
