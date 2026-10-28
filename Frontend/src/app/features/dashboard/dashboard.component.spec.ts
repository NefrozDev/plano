import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CLOCK } from '../../core/time/dates';
import { AgendaStore } from '../agenda/agenda.store';
import { TEST_TODAY, flushListReminders, settle } from '../../testing/plano-testing';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let auth: { user: ReturnType<typeof signal<AuthUser | null>> };
  const user: AuthUser = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    email: 'ada@example.com',
    locale: 'fr',
    avatarVersion: null,
  };

  beforeEach(async () => {
    auth = { user: signal<AuthUser | null>(user) };
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

  it('updates tasks, flipping only the targeted one', () => {
    const component =
      TestBed.createComponent(DashboardComponent).componentInstance;
    const before = component.tasks().map(({ done }) => done);
    component.toggleTask(0);
    expect(component.completedTasks()).toBe(2);
    expect(component.tasks().map(({ done }) => done)).toEqual([!before[0], ...before.slice(1)]);

    component.toggleTask(0);
    expect(component.tasks().map(({ done }) => done)).toEqual(before);
  });

  it('opens Settings from the profile picture, or the initials without one', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector('.profile-button') as HTMLAnchorElement;

    expect(link.getAttribute('href')).toBe('/settings');
    expect(link.getAttribute('aria-label')).toBe('Ouvrir les paramètres');
    expect(link.querySelector('app-user-avatar')?.textContent?.trim()).toBe('AL');
    expect(link.querySelector('img')).toBeNull();

    auth.user.set({ ...user, avatarVersion: 42 });
    fixture.detectChanges();
    expect(link.querySelector('img')?.getAttribute('src')).toBe('/api/v1/users/user-1/avatar?v=42');
  });

  it('shows no profile link while nobody is signed in', () => {
    auth.user.set(null);
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.profile-button')).toBeNull();
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
});
