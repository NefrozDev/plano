import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <div style="width: 360px">
      <app-page-header heading="Courir" backLink="/objectives" [showHeading]="showHeading()">
        <button type="button" style="width: 40px; height: 40px">⋯</button>
      </app-page-header>
    </div>
  `,
})
class HostComponent {
  readonly showHeading = input(true);
}

describe('PageHeaderComponent', () => {
  function render(showHeading: boolean) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
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
});
