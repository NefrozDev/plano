import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

export type MainSection = 'home' | 'agenda' | 'lists' | 'objectives';

/** `label` is a translation key. */
type NavItem = { id: MainSection; label: string; link: string } & ({ glyph: string; icon?: never } | { icon: string; glyph?: never });

const CALENDAR_ICON = 'M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5ZM4 10h16M8 3v4M16 3v4M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 16.5h.01M12 16.5h.01';

/** Main tab bar shared by the top-level screens. */
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="'nav.label' | transloco">
      @for (item of items; track item.id) {
        <a
          [routerLink]="item.link"
          [class.active]="active() === item.id"
          [attr.aria-current]="active() === item.id ? 'page' : null"
        >
          @if (item.icon) {
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="item.icon" /></svg>
          } @else {
            <span aria-hidden="true">{{ item.glyph }}</span>
          }
          {{ item.label | transloco }}
        </a>
      }
    </nav>
  `,
  styles: `
    :host { position: absolute; z-index: 10; right: 0; bottom: 0; left: 0; }
    nav { display: grid; grid-template-columns: repeat(4, 1fr); padding: .35rem 0 calc(.25rem + env(safe-area-inset-bottom)); border-top: 1px solid var(--color-border); background: white; }
    a { display: grid; gap: .1rem; min-height: 3.6rem; place-items: center; color: #272b32; font-size: .67rem; text-decoration: none; }
    span { font-size: 1.7rem; line-height: 1; }
    svg { width: 1.6rem; height: 1.7rem; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
    .active { color: var(--color-primary); }
  `,
})
export class BottomNavComponent {
  readonly active = input.required<MainSection>();
  readonly items = [
    { id: 'home', label: 'nav.home', glyph: '⌂', link: '/' },
    // No Unicode glyph reads as a monochrome calendar (📅 renders as a color emoji): draw it.
    { id: 'agenda', label: 'nav.agenda', icon: CALENDAR_ICON, link: '/agenda' },
    { id: 'lists', label: 'nav.lists', glyph: '☷', link: '/lists' },
    { id: 'objectives', label: 'nav.objectives', glyph: '◎', link: '/objectives' },
  ] satisfies readonly NavItem[];
}
