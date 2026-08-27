import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ListsComponent } from './lists.component';
import { ListsStore } from './lists.store';

describe('ListsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the lists landing page with the same four-item navigation as home', () => {
    const fixture = TestBed.createComponent(ListsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent).toBe('Listes');
    expect(element.querySelectorAll('.list-card').length).toBe(5);
    expect(element.querySelectorAll('.bottom-navigation button').length).toBe(4);
    expect(element.querySelector('.quick-add')).toBeNull();
  });

  it('filters personal, shared, and archived lists', () => {
    const component = TestBed.createComponent(ListsComponent).componentInstance;

    component.selectFilter('mine');
    expect(component.visibleLists().map((list) => list.name)).toEqual([
      'Idées cadeaux',
      'Projets maison',
    ]);
    component.selectFilter('shared');
    expect(component.visibleLists().length).toBe(3);
    component.selectFilter('archived');
    expect(component.visibleLists()).toEqual([]);
  });

  it('toggles between list and grid layouts from the header button', () => {
    const fixture = TestBed.createComponent(ListsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggle = element.querySelector('.menu-button') as HTMLButtonElement;

    expect(element.querySelector('.lists-content')?.classList).not.toContain(
      'grid-view',
    );
    toggle.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.gridView()).toBeTrue();
    expect(element.querySelector('.lists-content')?.classList).toContain(
      'grid-view',
    );
    expect(element.querySelectorAll('.grid-icon circle').length).toBe(6);
  });

  it('opens functional settings and applies overview preferences', () => {
    const fixture = TestBed.createComponent(ListsComponent);
    const component = fixture.componentInstance;
    const store = TestBed.inject(ListsStore);

    component.openSettings();
    component.setDefaultView('grid');
    component.toggleSetting('showCounts');
    fixture.detectChanges();

    expect(component.settingsOpen()).toBeTrue();
    expect(component.gridView()).toBeTrue();
    expect(store.settings().defaultView).toBe('grid');
    expect((fixture.nativeElement as HTMLElement).querySelector('.settings-panel')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.list-progress b')).toBeNull();
  });
});
