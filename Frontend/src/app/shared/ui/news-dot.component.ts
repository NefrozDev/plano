import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The small yellow dot on what a notification is about: an entry, a comment,
 * a card, a person. Inside a link or button, its label joins their name.
 */
@Component({
  selector: 'app-news-dot',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<i role="img" [attr.aria-label]="'notifications.newHere' | transloco"></i>`,
  styles: `
    :host { display: inline-grid; flex: none; place-items: center; vertical-align: middle; }
    /* The darker ring keeps the dot at 3:1 on white and on pale cards: yellow alone is not. */
    i { width: .6rem; height: .6rem; box-sizing: border-box; border: 2px solid #a15c00; border-radius: 50%; background: #fbbf24; }
  `,
})
export class NewsDotComponent {}
