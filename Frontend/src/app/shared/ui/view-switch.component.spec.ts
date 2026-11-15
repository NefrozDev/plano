import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewSwitchComponent, rowsOrGrid } from './view-switch.component';

describe('ViewSwitchComponent', () => {
  let fixture: ComponentFixture<ViewSwitchComponent>;
  let element: HTMLElement;
  let picks: string[];

  function render(grid: boolean): void {
    fixture = TestBed.createComponent(ViewSwitchComponent);
    fixture.componentRef.setInput('options', rowsOrGrid('lists.overview.asRows', 'lists.overview.asGrid'));
    fixture.componentRef.setInput('value', grid ? 'grid' : 'list');
    element = fixture.nativeElement as HTMLElement;
    picks = [];
    fixture.componentInstance.changed.subscribe((value) => picks.push(value));
    fixture.detectChanges();
  }

  const button = (name: 'list' | 'grid') => element.querySelector(`.${name}`) as HTMLButtonElement;

  it('shows both layouts in a named group, the current one pressed', () => {
    render(false);

    expect(element.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Affichage');
    expect(button('list').getAttribute('aria-label')).toBe('Afficher les listes en lignes');
    expect(button('grid').getAttribute('aria-label')).toBe('Afficher les listes en grille');
    expect(button('list').getAttribute('aria-pressed')).toBe('true');
    expect(button('grid').getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the other layout once, and nothing for the current one', () => {
    render(true);

    button('grid').click();
    expect(picks).toEqual([]);

    button('list').click();
    expect(picks).toEqual(['list']);
  });

  it('follows the layout it is given', () => {
    render(false);
    fixture.componentRef.setInput('value', 'grid');
    fixture.detectChanges();

    expect(button('grid').getAttribute('aria-pressed')).toBe('true');
    expect(button('list').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows letters for options without an icon, named in full', () => {
    fixture = TestBed.createComponent(ViewSwitchComponent);
    fixture.componentRef.setInput('options', [
      { value: 'day', label: 'agenda.views.day', short: 'agenda.views.dayShort' },
      { value: 'week', label: 'agenda.views.week', short: 'agenda.views.weekShort' },
      { value: 'month', label: 'agenda.views.month', short: 'agenda.views.monthShort' },
    ]);
    fixture.componentRef.setInput('value', 'month');
    fixture.detectChanges();
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));

    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['J', 'S', 'M']);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Jour', 'Semaine', 'Mois']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    // The letter is only a picture of the name: screen readers hear the label.
    expect(buttons[0].querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
  });
});
