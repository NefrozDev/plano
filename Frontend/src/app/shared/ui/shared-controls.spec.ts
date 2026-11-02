import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AvatarPerson, AvatarStackComponent } from './avatar-stack.component';
import { SearchFieldComponent } from './search-field.component';
import { SwitchRowComponent } from './switch-row.component';

const person = (id: string, name: string): AvatarPerson => ({ id, name, initials: name.charAt(0), color: '#3264ed' });

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SwitchRowComponent, SearchFieldComponent, AvatarStackComponent],
  template: `
    <app-switch-row label="Notifications" [hint]="hint()" [checked]="on()" (toggled)="on.set(!on())" />
    <app-search-field label="Rechercher" placeholder="Rechercher…" [maxLength]="20" [autofocus]="focus" [(value)]="query" />
    <app-avatar-stack [people]="people()" [max]="2" [label]="stackLabel()" />
  `,
})
class HostComponent {
  readonly on = signal(false);
  readonly hint = signal('');
  readonly query = signal('initial');
  readonly people = signal<AvatarPerson[]>([]);
  readonly stackLabel = signal('');
  focus = true;
}

describe('shared form controls', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
  }

  it('switch row reflects its state, shows an optional hint and reports clicks', () => {
    const { fixture, host, element } = render();
    const button = element.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(element.querySelector('app-switch-row small')).toBeNull();

    button.click();
    host.hint.set('Plus de détails');
    fixture.detectChanges();

    expect(host.on()).toBe(true);
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(element.querySelector('.switch')?.classList).toContain('on');
    expect(element.querySelector('app-switch-row small')?.textContent).toBe('Plus de détails');
  });

  it('search field two-way binds its value, labels the input and can take focus', () => {
    const { host, element } = render();
    TestBed.tick();
    const input = element.querySelector('app-search-field input') as HTMLInputElement;

    expect(input.value).toBe('initial');
    expect(input.getAttribute('aria-label')).toBe('Rechercher');
    expect(input.getAttribute('maxlength')).toBe('20');
    expect(document.activeElement).toBe(input);

    input.value = 'camille';
    input.dispatchEvent(new Event('input'));
    expect(host.query()).toBe('camille');
  });

  it('avatar stack shows pictures, falls back to initials, and keeps the bubbles the same size', () => {
    const { fixture, host, element } = render();

    host.people.set([{ ...person('a', 'Alex'), avatarVersion: 9 }, person('b', 'Béa')]);
    fixture.detectChanges();
    const [withPicture, withInitials] = Array.from(element.querySelectorAll<HTMLElement>('.avatar'));

    const picture = withPicture.querySelector('img') as HTMLImageElement;
    expect(picture.getAttribute('src')).toBe('/api/v1/users/a/avatar?v=9');
    expect(withInitials.textContent?.trim()).toBe('B');
    expect(withPicture.getBoundingClientRect().width).toBe(withInitials.getBoundingClientRect().width);
    // A picture that cannot load leaves the initials, not a broken image.
    picture.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(withPicture.querySelector('img')).toBeNull();
    expect(withPicture.textContent?.trim()).toBe('A');
  });

  it('avatar stack caps the bubbles, counts the rest and labels the group', () => {
    const { fixture, host, element } = render();
    expect(element.querySelector('.avatars')).toBeNull();

    host.people.set([person('a', 'Alex'), person('b', 'Béa'), person('c', 'Chloé')]);
    fixture.detectChanges();
    expect(Array.from(element.querySelectorAll('.avatar')).map((avatar) => avatar.textContent?.trim())).toEqual(['A', 'B', '+1']);
    expect(element.querySelector('.avatars')?.getAttribute('aria-label')).toBe('Alex, Béa, Chloé');

    host.stackLabel.set('Avec 3 personnes');
    fixture.detectChanges();
    expect(element.querySelector('.avatars')?.getAttribute('aria-label')).toBe('Avec 3 personnes');
  });
});

describe('global form styles', () => {
  it('draws every kind of field in the app font, which browsers do not do on their own', () => {
    const fields = ['input', 'textarea', 'select', 'button'].map((tag) => document.body.appendChild(document.createElement(tag)));
    try {
      const appFont = getComputedStyle(document.body).fontFamily;
      expect(appFont).toContain('Inter');
      for (const field of fields) expect(getComputedStyle(field).fontFamily, field.tagName).toBe(appFont);
    } finally {
      fields.forEach((field) => field.remove());
    }
  });
});
