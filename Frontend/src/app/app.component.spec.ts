import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { FriendNotificationsService } from './core/friends/friend-notifications.service';
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
