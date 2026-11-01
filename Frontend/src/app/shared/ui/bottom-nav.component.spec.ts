import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectiveNotificationsService } from '../../features/objectives/objective-notifications.service';
import { providePlanoTesting } from '../../testing/plano-testing';
import { BottomNavComponent } from './bottom-nav.component';

describe('BottomNavComponent', () => {
  let fixture: ComponentFixture<BottomNavComponent>;
  let element: HTMLElement;

  const objectivesTab = () => element.querySelector('a[href="/objectives"]') as HTMLAnchorElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BottomNavComponent], providers: providePlanoTesting() });
    fixture = TestBed.createComponent(BottomNavComponent);
    fixture.componentRef.setInput('active', 'home');
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('marks the current section', () => {
    const active = element.querySelector('a.active');

    expect(active?.getAttribute('href')).toBe('/');
    expect(active?.getAttribute('aria-current')).toBe('page');
    expect(element.querySelectorAll('a[aria-current]')).toHaveLength(1);
  });

  it('shows no badge without news', () => {
    expect(element.querySelector('.badge')).toBeNull();
    expect(objectivesTab().getAttribute('aria-label')).toBeNull();
  });

  it('shows objective news on their tab, and says so to screen readers', () => {
    TestBed.inject(ObjectiveNotificationsService).unseen.set(3);
    fixture.detectChanges();

    expect(element.querySelectorAll('.badge')).toHaveLength(1);
    expect(objectivesTab().querySelector('.badge')?.textContent).toBe('3');
    expect(objectivesTab().getAttribute('aria-label')).toBe('Objectifs, 3 nouveauté(s)');
  });
});
