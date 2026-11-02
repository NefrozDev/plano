import { Location } from '@angular/common';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <div style="width: 360px">
      <app-page-header
        heading="Courir"
        backLink="/objectives"
        [showHeading]="showHeading()"
        [returnToPrevious]="returnToPrevious()"
      >
        <button type="button" style="width: 40px; height: 40px">⋯</button>
      </app-page-header>
    </div>
  `,
})
class HostComponent {
  readonly showHeading = input(true);
  readonly returnToPrevious = input(false);
}

@Component({ template: '' })
class BlankComponent {}

const routes = [
  { path: 'lists', component: BlankComponent },
  { path: 'settings', component: BlankComponent },
];

describe('PageHeaderComponent', () => {
  function render(showHeading: boolean) {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentRef.setInput('showHeading', showHeading);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      header: element.querySelector('header')!.getBoundingClientRect(),
      action: element.querySelector('button')!.getBoundingClientRect(),
      heading: element.querySelector('h1')!,
    };
  }

  it('keeps the actions in the top right corner, inside the header padding', () => {
    const { header, action, heading } = render(true);

    expect(heading.classList).not.toContain('visually-hidden');
    expect(header.right - action.right).toBeCloseTo(16, 0);
  });

  it('keeps the actions in the corner when the title is hidden', () => {
    const { header, action, heading } = render(false);

    expect(heading.classList).toContain('visually-hidden');
    expect(heading.textContent).toContain('Courir');
    expect(header.right - action.right).toBeCloseTo(16, 0);
  });

  describe('going back', () => {
    function renderBack(returnToPrevious: boolean): HTMLElement {
      const fixture = TestBed.createComponent(HostComponent);
      fixture.componentRef.setInput('returnToPrevious', returnToPrevious);
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelector('.nav-link') as HTMLElement;
    }

    beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

    it('links to its fixed place by default, even with history', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/lists');
      await router.navigateByUrl('/settings');

      const link = renderBack(false);

      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('/objectives');
    });

    it('can return to the previous screen instead', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/lists');
      await router.navigateByUrl('/settings');
      const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);

      const button = renderBack(true);
      button.click();

      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('aria-label')).toBe('Retour');
      expect(back).toHaveBeenCalledTimes(1);
    });

    it('falls back to its fixed place when the app was opened on this screen', async () => {
      await TestBed.inject(Router).navigateByUrl('/settings');

      const link = renderBack(true);

      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('/objectives');
    });
  });
});
