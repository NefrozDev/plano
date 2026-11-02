import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';
import { SPLASH_EXIT_MS, SplashScreenComponent } from './splash-screen.component';

describe('SplashScreenComponent', () => {
  let fixture: ComponentFixture<SplashScreenComponent>;
  let element: HTMLElement;
  let done: Mock<() => void>;

  function render(duration?: number): void {
    fixture = TestBed.createComponent(SplashScreenComponent);
    if (duration !== undefined) fixture.componentRef.setInput('duration', duration);
    element = fixture.nativeElement as HTMLElement;
    done = vi.fn<() => void>();
    fixture.componentInstance.done.subscribe(done);
    fixture.detectChanges();
  }

  const advance = (ms: number): void => {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the logo, the name, the tagline and the company, hidden from screen readers', () => {
    render();

    expect(element.querySelector('svg.mark')).not.toBeNull();
    expect(element.querySelector('.name')?.textContent).toBe('Plano');
    expect(element.querySelector('.tagline')?.textContent).toBe('Vos ambitions méritent un plan');
    expect(element.querySelector('.company')?.textContent).toBe('Synapse Engineering');
    expect(element.getAttribute('aria-hidden')).toBe('true');
  });

  it('fades out on its own after 2 seconds, then says it is done once', () => {
    render();

    advance(1999);
    expect(element.classList).not.toContain('leaving');
    expect(done).not.toHaveBeenCalled();

    advance(1);
    expect(element.classList).toContain('leaving');
    expect(done).not.toHaveBeenCalled();

    advance(SPLASH_EXIT_MS);
    expect(done).toHaveBeenCalledTimes(1);
    advance(5000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('leaves at once on a tap or a click, without the timer firing again', () => {
    render();

    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(element.classList).toContain('leaving');

    advance(SPLASH_EXIT_MS);
    expect(done).toHaveBeenCalledTimes(1);
    // A second tap during or after the fade changes nothing.
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    advance(3000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('leaves on a key press', () => {
    render();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    advance(SPLASH_EXIT_MS);

    expect(done).toHaveBeenCalledTimes(1);
  });

  it('times the progress bar with the delay it is given', () => {
    render(1200);

    expect(element.style.getPropertyValue('--splash-duration')).toBe('1200ms');
    advance(1200);
    expect(element.classList).toContain('leaving');
  });

  it('stops its timer when removed early', () => {
    render();
    fixture.destroy();

    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
  });
});
