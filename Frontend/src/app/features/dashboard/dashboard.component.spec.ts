import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { HomeList } from '@plano/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthUser } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { APP_CLOCK } from '../../core/time/dates';
import { AgendaStore } from '../agenda/agenda.store';
import { TEST_TODAY, flushListReminders, provideSeedData, settle } from '../../testing/plano-testing';
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

  let http: HttpTestingController;
  const homeList = (changes: Partial<HomeList> = {}): HomeList => ({
    id: 'courses',
    name: 'Courses',
    icon: 'cart',
    color: '#2ecb70',
    role: 'owner',
    remaining: 7,
    entries: [
      { id: 'milk', name: 'Lait' },
      { id: 'eggs', name: 'Œufs' },
    ],
    ...changes,
  });
  const flushHome = (lists: HomeList[]) => http.expectOne('/api/v1/lists/home').flush(lists);

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
        provideSeedData(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  it('renders the French landing page for the restored user', () => {
    const loadTasks = vi.spyOn(TestBed.inject(AgendaStore), 'loadTasks');
    const fixture = TestBed.createComponent(DashboardComponent);
    // The week dots need the dated list tasks: loaded once on creation.
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

  describe('pinned lists', () => {
    it('shows the pinned lists in order, with their first unchecked items and links', async () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      flushHome([
        homeList(),
        homeList({ id: 'maison', name: 'Maison', color: '#3264ed', remaining: 0, entries: [] }),
      ]);
      await settle();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const sections = Array.from(element.querySelectorAll<HTMLElement>('.home-list'));

      expect(sections.map((section) => section.querySelector('h2')?.textContent)).toEqual(['Courses', 'Maison']);
      expect(sections[0].style.getPropertyValue('--list-color')).toBe('#2ecb70');
      expect(Array.from(sections[0].querySelectorAll('label')).map((label) => label.textContent?.trim())).toEqual([
        'Lait',
        'Œufs',
      ]);
      expect(sections[0].querySelector('.section-heading a')?.textContent).toContain('7 à faire');
      expect(sections[0].querySelector('.section-heading a')?.getAttribute('href')).toBe('/lists/courses');
      // 7 unchecked, 2 shown: the rest is one tap away.
      expect(sections[0].querySelector('.card-link')?.textContent).toContain('+ 5 de plus');
      expect(sections[1].querySelector('.section-heading a')?.textContent).toContain('voir la liste');
      expect(sections[1].querySelector('.card-link')?.textContent).toContain('Tout est fait');
      expect(element.querySelector('.home-hint')).toBeNull();
      // Lists come before the objectives.
      expect(element.querySelector('.dashboard-section:last-of-type h2')?.textContent).toBe('Mes objectifs');
    });

    it('ticks an item once, then shows the refreshed list', async () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      flushHome([homeList()]);
      await settle();
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const boxes = () => Array.from(element.querySelectorAll<HTMLInputElement>('.home-list input'));

      boxes()[0].click();
      boxes()[1].click();
      fixture.detectChanges();
      expect(boxes().every((box) => box.disabled)).toBe(true);
      const tick = http.expectOne('/api/v1/lists/courses/entries/milk');
      expect(tick.request.method).toBe('PATCH');
      expect(tick.request.body).toEqual({ done: true });
      http.expectNone('/api/v1/lists/courses/entries/eggs');
      tick.flush({ id: 'milk', done: true });
      await settle();
      flushHome([homeList({ remaining: 6, entries: [{ id: 'eggs', name: 'Œufs' }] })]);
      await settle();
      fixture.detectChanges();

      expect(boxes()).toHaveLength(1);
      expect(boxes()[0].disabled).toBe(false);
      expect(element.querySelector('.home-list label')?.textContent).toContain('Œufs');
    });

    it('lets viewers see a pinned list without ticking it', async () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      flushHome([homeList({ role: 'viewer' })]);
      await settle();
      fixture.detectChanges();

      const boxes = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('.home-list input');
      expect(Array.from(boxes).every((box) => box.disabled)).toBe(true);
    });

    it('explains how to pin a list once it knows none is pinned, and has no default list', async () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      // Still loading: no hint yet.
      expect(element.querySelector('.home-hint')).toBeNull();

      flushHome([]);
      await settle();
      fixture.detectChanges();

      const hint = element.querySelector('.home-hint') as HTMLAnchorElement;
      expect(hint.getAttribute('href')).toBe('/lists');
      expect(element.querySelector('.tasks-card')).toBeNull();
      expect(element.textContent).not.toContain('À faire');
    });
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

  it('has no agenda preview, but marks the week days that have agenda items', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    flushListReminders();
    await settle();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.agenda-card')).toBeNull();
    expect(element.textContent).not.toContain('Rien de prévu');
    // No pinned list yet: the objectives are the only section.
    expect(element.querySelectorAll('.dashboard-section')).toHaveLength(1);
    // Thursday 15 October has agenda items, list reminders included.
    expect(element.querySelector('.week-day.selected i')).not.toBeNull();
  });

  it('spaces the home cards and their headings the same way', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    flushHome([homeList()]);
    await settle();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const style = (selector: string) => getComputedStyle(element.querySelector(selector) as HTMLElement);
    const cards = ['.list-card', '.goals-card'].map((selector) => style(selector).padding);
    const headings = Array.from(element.querySelectorAll<HTMLElement>('.dashboard-section .section-heading'))
      .map((heading) => getComputedStyle(heading).marginBottom);

    expect(new Set(cards).size).toBe(1);
    expect(cards[0]).not.toBe('0px');
    expect(headings.length).toBe(2);
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
