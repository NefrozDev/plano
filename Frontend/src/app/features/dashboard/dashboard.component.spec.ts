import type { MockedObject } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CLOCK } from '../../core/time/dates';
import { AgendaStore } from '../agenda/agenda.store';
import { TEST_TODAY, flushListReminders, settle } from '../../testing/plano-testing';
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
      ],
    }).compileComponents();
  });

  it('renders the French landing page for the restored user', () => {
    const loadTasks = vi.spyOn(TestBed.inject(AgendaStore), 'loadTasks');
    const fixture = TestBed.createComponent(DashboardComponent);
    // The agenda preview needs the dated list tasks: loaded once on creation.
    expect(loadTasks).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toContain('Bonjour Ada');
    expect(element.textContent).toContain('Mes objectifs');
    expect(
      Array.from(element.querySelectorAll('app-bottom-nav a')).map((link) => link.getAttribute('href')),
    ).toEqual(['/', '/agenda', '/lists', '/objectives']);
    expect(element.querySelector('app-bottom-nav a.active')?.textContent).toContain('Accueil');
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
    const before = component.tasks().map(({ done }) => done);
    component.toggleTask(0);
    component.toggleProfileMenu();
    expect(component.completedTasks()).toBe(2);
    // Only the targeted task flips.
    expect(component.tasks().map(({ done }) => done)).toEqual([!before[0], ...before.slice(1)]);
    expect(component.profileMenuOpen()).toBe(true);

    component.toggleTask(0);
    component.toggleProfileMenu();
    expect(component.tasks().map(({ done }) => done)).toEqual(before);
    expect(component.profileMenuOpen()).toBe(false);
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

  it('spaces the three home cards and their headings the same way', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const style = (selector: string) => getComputedStyle(element.querySelector(selector) as HTMLElement);
    const cards = ['.agenda-card', '.tasks-card', '.goals-card'].map((selector) => style(selector).padding);
    const headings = Array.from(element.querySelectorAll<HTMLElement>('.dashboard-section .section-heading'))
      .map((heading) => getComputedStyle(heading).marginBottom);

    expect(new Set(cards).size).toBe(1);
    expect(cards[0]).not.toBe('0px');
    expect(headings.length).toBe(3);
    expect(new Set(headings).size).toBe(1);
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
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    auth.logout.mockReturnValue(throwError(() => new Error('offline')));
    component.logout();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    // Still signed in on the server: stay on the page.
    expect(navigate).not.toHaveBeenCalled();
    expect(component.logoutError()).toContain('déconnexion a échoué');
    expect(component.logoutPending()).toBe(false);
  });
});
