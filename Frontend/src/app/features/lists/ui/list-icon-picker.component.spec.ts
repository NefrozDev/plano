import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ListIcon } from '@plano/common';
import { ListIconPickerComponent } from './list-icon-picker.component';
import { LIST_ICON_GROUPS } from './list-icons';

@Component({
  imports: [ListIconPickerComponent],
  template: `<app-list-icon-picker [(value)]="icon" />`,
})
class HostComponent {
  readonly icon = signal<ListIcon>('cart');
}

describe('ListIconPickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let element: HTMLElement;

  const line = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.line .choice'));
  const labels = (buttons: HTMLButtonElement[]) => buttons.map((button) => button.getAttribute('aria-label'));
  const dialog = () => element.querySelector('dialog') as HTMLDialogElement;
  const catalog = () => Array.from(element.querySelectorAll<HTMLButtonElement>('.catalog .choice'));

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('shows the first line of the catalog, then "+"', () => {
    expect(labels(line())).toEqual(['Courses', 'Panier', 'Maison', 'Cuisine', 'Ménage', 'Toutes les icônes']);
    expect(line()[0].getAttribute('aria-pressed')).toBe('true');
    expect(dialog().open).toBe(false);
  });

  it('picks an icon of the first line', () => {
    line()[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.icon()).toBe('home');
    expect(line()[2].getAttribute('aria-pressed')).toBe('true');
    expect(line()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('opens every icon by theme, and a choice there closes it and stays in sight', async () => {
    line().at(-1)!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dialog().open).toBe(true);
    expect(Array.from(element.querySelectorAll('.catalog h3'), (heading) => heading.textContent)).toEqual(
      ['Courses et maison', 'Cuisine et repas', 'Voyages et sorties', 'Loisirs et fêtes', 'Travail et études', 'Santé et famille', 'Argent', 'Divers'],
    );
    expect(catalog()).toHaveLength(LIST_ICON_GROUPS.flatMap(({ icons }) => icons).length);

    catalog().find((button) => button.getAttribute('aria-label') === 'Avion')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.icon()).toBe('plane');
    expect(dialog().open).toBe(false);
    // Off the first line: it takes the last place before "+".
    expect(labels(line())).toEqual(['Courses', 'Panier', 'Maison', 'Cuisine', 'Avion', 'Toutes les icônes']);
    expect(line()[4].getAttribute('aria-pressed')).toBe('true');
  });

  it('marks the current icon in the catalog, and closes without a change', async () => {
    fixture.componentInstance.icon.set('paw');
    fixture.detectChanges();
    line().at(-1)!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const pressed = catalog().filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(labels(pressed)).toEqual(['Animaux']);

    dialog().close();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.icon()).toBe('paw');
  });
});
