import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type MainSection = 'home' | 'agenda' | 'lists' | 'objectives';

/** Main tab bar shared by the top-level screens. */
@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Navigation principale">
      @for (item of items; track item.id) {
        <a
          [routerLink]="item.link"
          [class.active]="active() === item.id"
          [attr.aria-current]="active() === item.id ? 'page' : null"
        ><span aria-hidden="true">{{ item.glyph }}</span>{{ item.label }}</a>
      }
    </nav>
  `,
  styles: `
    :host { position: absolute; z-index: 10; right: 0; bottom: 0; left: 0; }
    nav { display: grid; grid-template-columns: repeat(4, 1fr); padding: .35rem 0 calc(.25rem + env(safe-area-inset-bottom)); border-top: 1px solid var(--color-border); background: white; }
    a { display: grid; gap: .1rem; min-height: 3.6rem; place-items: center; color: #272b32; font-size: .67rem; text-decoration: none; }
    span { font-size: 1.7rem; line-height: 1; }
    .active { color: var(--color-primary); }
  `,
})
export class BottomNavComponent {
  readonly active = input.required<MainSection>();
  readonly items = [
    { id: 'home', label: 'Accueil', glyph: '⌂', link: '/' },
    { id: 'agenda', label: 'Agenda', glyph: '▣', link: '/agenda' },
    { id: 'lists', label: 'Liste', glyph: '☷', link: '/lists' },
    { id: 'objectives', label: 'Objectifs', glyph: '◎', link: '/objectives' },
  ] as const;
}
