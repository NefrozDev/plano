import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListSectionCreatorComponent, NewSection } from './list-section-creator.component';

describe('ListSectionCreatorComponent', () => {
  let fixture: ComponentFixture<ListSectionCreatorComponent>;
  let creator: ListSectionCreatorComponent;
  let created: NewSection[];

  beforeEach(() => {
    fixture = TestBed.createComponent(ListSectionCreatorComponent);
    creator = fixture.componentInstance;
    created = [];
    creator.create.subscribe((section) => created.push(section));
    fixture.detectChanges();
  });

  it('focuses the name field when opened', () => {
    expect(document.activeElement).toBe((fixture.nativeElement as HTMLElement).querySelector('input'));
  });

  it('refuses blank names and emits the trimmed name with the chosen colour', () => {
    creator.name.set('   ');
    creator.save();
    expect(created).toEqual([]);

    creator.name.set(' Surgelés ');
    creator.color.set('#3978ed');
    creator.save();
    expect(created).toEqual([{ name: 'Surgelés', color: '#3978ed' }]);
  });
});
