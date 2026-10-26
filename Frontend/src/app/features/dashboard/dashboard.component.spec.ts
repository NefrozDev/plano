import type { MockedObject } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { PLANO_DATA_ADAPTER } from '../../core/data/plano-data.adapter';
import { APP_CLOCK } from '../../core/time/dates';
import { AgendaStore } from '../agenda/agenda.store';
import { TEST_TODAY, flushListReminders, provideSeedData, settle } from '../../testing/plano-testing';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let auth: MockedObject<Pick<AuthService, 'logout'>> & {
    user: ReturnType<typeof signal<AuthUser | null>>;
  };
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
  };

  beforeEach(async () => {
    auth = Object.assign(
      {
        logout: vi.fn().mockName('AuthService.logout'),
      },
      { user: signal<AuthUser | null>(user) },
    );
    auth.logout.mockReturnValue(of(void 0));
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: APP_CLOCK, useValue: () => new Date(TEST_TODAY) },
        provideSeedData(),
      ],
    }).compileComponents();
  });

  it('renders the French landing page for the restored user', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toContain('Bonjour Ada');
    expect(element.textContent).toContain('Mes objectifs');
    expect(
      Array.from(element.querySelectorAll('app-bottom-nav a')).map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/agenda', '/lists', '/objectives']);
    expect(element.querySelector('app-bottom-nav a.active')?.textContent).toContain('Accueil');
  });

  it('shows the current week with today highlighted', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const week = (fixture.nativeElement as HTMLElement).querySelector('.week-card')!;

    expect(week.getAttribute('aria-label')).toBe('Semaine du 12 au 18');
    expect(Array.from(week.querySelectorAll('.week-day strong')).map((day) => day.textContent)).toEqual(
      ['12', '13', '14', '15', '16', '17', '18'],
    );
    expect(week.querySelector('.week-day.selected')?.textContent).toContain('jeu');
  });

  it('falls back to the username and anonymous display value', () => {
    const component =
      TestBed.createComponent(DashboardComponent).componentInstance;
    auth.user.set({ ...user, firstName: '' });
    expect(component.displayName()).toBe('ada');
    auth.user.set(null);
    expect(component.displayName()).toBe('vous');
  });

  it('updates tasks and the profile menu', () => {
    const component =
      TestBed.createComponent(DashboardComponent).componentInstance;
    component.toggleTask(0);
    component.toggleProfileMenu();
    expect(component.completedTasks()).toBe(2);
    expect(component.profileMenuOpen()).toBe(true);
  });

  describe('adding a task', () => {
    const taskLabels = (element: HTMLElement) =>
      Array.from(element.querySelectorAll('.tasks-card label span')).map((label) => label.textContent);

    function openTaskInput() {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      element.querySelector<HTMLButtonElement>('.tasks-card .card-link')!.click();
      fixture.detectChanges();
      return { fixture, element, input: element.querySelector<HTMLInputElement>('.new-task-input')! };
    }

    function type(input: HTMLInputElement, value: string) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }

    it('opens a focused field and adds the task on Enter, saving it', async () => {
      const { fixture, element, input } = openTaskInput();
      await fixture.whenStable();
      expect(document.activeElement).toBe(input);

      type(input, '  Appeler le plombier  ');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();

      expect(taskLabels(element)).toEqual([
        'Préparer la présentation', '30 minutes de course à pied', 'Réserver le restaurant', 'Appeler le plombier',
      ]);
      expect(element.querySelector('.new-task-input')).toBeNull();
      expect(element.querySelector('[aria-labelledby="tasks-title"] .section-heading span')?.textContent).toBe('1/4');
      expect(TestBed.inject(PLANO_DATA_ADAPTER).load()?.dashboard.tasks.at(-1)).toEqual(
        expect.objectContaining({ label: 'Appeler le plombier', done: false }),
      );
    });

    it('also adds on blur, and gives every task its own id', () => {
      const { fixture, element, input } = openTaskInput();
      type(input, 'Appeler le plombier');
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.beginAddingTask();
      component.newTaskValue.set('Appeler le plombier');
      component.finishAddingTask();
      fixture.detectChanges();

      const ids = component.tasks().map((task) => task.id);
      expect(taskLabels(element).filter((label) => label === 'Appeler le plombier')).toHaveLength(2);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('closes without adding on Escape or when left empty', () => {
      const { fixture, element, input } = openTaskInput();
      type(input, 'Abandonnée');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(element.querySelector('.new-task-input')).toBeNull();

      element.querySelector<HTMLButtonElement>('.tasks-card .card-link')!.click();
      fixture.detectChanges();
      const emptyInput = element.querySelector<HTMLInputElement>('.new-task-input')!;
      type(emptyInput, '   ');
      emptyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();

      expect(taskLabels(element)).toHaveLength(3);
      expect(element.querySelector('.new-task-input')).toBeNull();
    });
  });

  it('previews today from the agenda, list reminders included, linking to each item', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    flushListReminders();
    await settle();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const events = element.querySelectorAll('.agenda-card .event');

    // Thursday 15 October has 7 items: the card shows 3 and links to the rest.
    expect(events.length).toBe(3);
    expect(events[0].textContent).toContain('09:00');
    expect(events[0].getAttribute('href')).toBe('/agenda/events/rendez-vous-projet?date=2026-10-15');
    expect(element.querySelector('.agenda-card a.card-link')?.textContent).toContain('voir tout (7)');
    expect(element.querySelector('.section-heading a')?.getAttribute('href')).toBe('/agenda');
  });

  it('labels all-day items and offers to plan an empty day', () => {
    // Friday 16 October only has Camille's birthday (all day).
    TestBed.overrideProvider(APP_CLOCK, { useValue: () => new Date(2026, 9, 16, 8) });
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.agenda-card .event strong')?.textContent).toBe('Journée');

    TestBed.inject(AgendaStore).updateFilters({ showEvents: false });
    fixture.detectChanges();
    expect(element.querySelector('.agenda-card .card-link')?.getAttribute('href')).toBe('/agenda/new');
  });

  it('shows the two active objectives due first, linked to their pages', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const goals = (fixture.nativeElement as HTMLElement).querySelectorAll('.goals-card .goal');

    expect(goals.length).toBe(2);
    expect(goals[0].textContent).toContain('Méditer 30 min par jour');
    expect(goals[1].getAttribute('href')).toBe('/objectives/courir-10-km');
    expect(goals[1].textContent).toContain('65%');
  });

  it('logs out and returns to login', () => {
    const component = TestBed.createComponent(DashboardComponent).componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.logout();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('ignores duplicate logout clicks and reports failures', () => {
    const component =
      TestBed.createComponent(DashboardComponent).componentInstance;
    component.logoutPending.set(true);
    component.logout();
    expect(auth.logout).not.toHaveBeenCalled();
    component.logoutPending.set(false);
    auth.logout.mockReturnValue(throwError(() => new Error('offline')));
    component.logout();
    expect(component.logoutError()).toContain('déconnexion a échoué');
    expect(component.logoutPending()).toBe(false);
  });
});
