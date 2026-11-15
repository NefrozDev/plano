import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViewSwitchComponent } from './view-switch.component';

describe('ViewSwitchComponent', () => {
  let fixture: ComponentFixture<ViewSwitchComponent>;
  let element: HTMLElement;
  let picks: boolean[];

  function render(grid: boolean): void {
    fixture = TestBed.createComponent(ViewSwitchComponent);
    fixture.componentRef.setInput('grid', grid);
    fixture.componentRef.setInput('rowsLabel', 'lists.overview.asRows');
    fixture.componentRef.setInput('gridLabel', 'lists.overview.asGrid');
    element = fixture.nativeElement as HTMLElement;
    picks = [];
    fixture.componentInstance.changed.subscribe((value) => picks.push(value));
    fixture.detectChanges();
  }

  const button = (name: 'rows' | 'grid') => element.querySelector(`.${name}`) as HTMLButtonElement;

  it('shows both layouts in a named group, the current one pressed', () => {
    render(false);

    expect(element.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Affichage');
    expect(button('rows').getAttribute('aria-label')).toBe('Afficher les listes en lignes');
    expect(button('grid').getAttribute('aria-label')).toBe('Afficher les listes en grille');
    expect(button('rows').getAttribute('aria-pressed')).toBe('true');
    expect(button('grid').getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the other layout once, and nothing for the current one', () => {
    render(true);

    button('grid').click();
    expect(picks).toEqual([]);

    button('rows').click();
    expect(picks).toEqual([false]);
  });

  it('follows the layout it is given', () => {
    render(false);
    fixture.componentRef.setInput('grid', true);
    fixture.detectChanges();

    expect(button('grid').getAttribute('aria-pressed')).toBe('true');
    expect(button('rows').getAttribute('aria-pressed')).toBe('false');
  });
});
