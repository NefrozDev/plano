import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { FriendNotificationsService } from './core/friends/friend-notifications.service';
import { ObjectiveNotificationsService } from './features/objectives/objective-notifications.service';
import { SPLASH_EXIT_MS } from './shared/ui/splash-screen.component';
import { providePlanoTesting } from './testing/plano-testing';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...providePlanoTesting(), provideRouter([])],
    }).compileComponents();
  });

  it('should create the routed application shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('router-outlet'),
    ).toBeTruthy();
  });

  it('opens on the splash screen, over the routed screen, until it is done', () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('app-splash-screen')).not.toBeNull();
      expect(element.querySelector('router-outlet')).not.toBeNull();

      vi.advanceTimersByTime(2000 + SPLASH_EXIT_MS);
      fixture.detectChanges();

      expect(fixture.componentInstance.splash()).toBe(false);
      expect(element.querySelector('app-splash-screen')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows objective news the same way, and clears it when dismissed', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const news = TestBed.inject(ObjectiveNotificationsService);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    news.message.set('Courir est terminé.');
    fixture.detectChanges();
    const toast = element.querySelector('.notification-toast .toast') as HTMLButtonElement;
    expect(toast.textContent).toContain('Courir est terminé.');

    toast.click();
    fixture.detectChanges();
    expect(news.message()).toBe('');
    expect(element.querySelector('.notification-toast .toast')).toBeNull();
  });

  it('lets friend news go first when both come at once', () => {
    const fixture = TestBed.createComponent(AppComponent);
    TestBed.inject(ObjectiveNotificationsService).message.set('Objectif');
    TestBed.inject(FriendNotificationsService).message.set('Ami');
    fixture.detectChanges();

    expect(fixture.componentInstance.toast()).toBe('Ami');
  });

  it('shows friend news app-wide, above the screens, until dismissed', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const notifications = TestBed.inject(FriendNotificationsService);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.notification-toast .toast')).toBeNull();

    notifications.message.set('Bob Martin a accepté votre demande d’ami.');
    fixture.detectChanges();
    const toast = element.querySelector('.notification-toast .toast') as HTMLButtonElement;
    expect(toast.textContent).toContain('Bob Martin a accepté');
    expect(toast.querySelector('.check.info')).not.toBeNull();

    toast.click();
    fixture.detectChanges();
    expect(notifications.message()).toBe('');
    expect(element.querySelector('.notification-toast .toast')).toBeNull();
  });
});
