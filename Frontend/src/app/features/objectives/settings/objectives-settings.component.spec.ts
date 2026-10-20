import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectivesStore } from '../objectives.store';
import { provideObjectivesTesting } from '../objectives.testing';
import { ObjectivesSettingsComponent } from './objectives-settings.component';

describe('ObjectivesSettingsComponent', () => {
  let fixture: ComponentFixture<ObjectivesSettingsComponent>;
  let element: HTMLElement;
  let store: ObjectivesStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObjectivesSettingsComponent],
      providers: provideObjectivesTesting(),
    });
    fixture = TestBed.createComponent(ObjectivesSettingsComponent);
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  });

  it('reflects the saved settings', () => {
    const switches = element.querySelectorAll('[role="switch"]');
    expect(switches.length).toBe(4);
    expect(switches[0].getAttribute('aria-checked')).toBe('false');
    expect(switches[1].getAttribute('aria-checked')).toBe('true');
    expect((element.querySelectorAll('select')[1] as HTMLSelectElement).value).toBe('day-before');
  });

  it('toggles switches', () => {
    element.querySelectorAll<HTMLButtonElement>('[role="switch"]').forEach((toggle) => toggle.click());
    fixture.detectChanges();

    expect(store.settings()).toEqual(
      expect.objectContaining({
        showArchived: true,
        notifications: false,
        showPercentage: false,
        categoryColors: false,
      }),
    );
    expect(element.querySelector('.switch.on')).not.toBeNull();
  });

  it('updates select-based settings', () => {
    const [view, dueReminder, habits] = Array.from(element.querySelectorAll('select'));
    view.value = 'grid';
    view.dispatchEvent(new Event('change'));
    dueReminder.value = 'week-before';
    dueReminder.dispatchEvent(new Event('change'));
    habits.value = 'none';
    habits.dispatchEvent(new Event('change'));

    expect(store.settings()).toEqual(
      expect.objectContaining({
        defaultView: 'grid',
        defaultDueReminder: 'week-before',
        habitReminders: 'none',
      }),
    );
  });
});
