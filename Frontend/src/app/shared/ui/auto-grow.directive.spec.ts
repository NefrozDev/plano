import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AutoGrowDirective } from './auto-grow.directive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutoGrowDirective],
  template: `<textarea appAutoGrow rows="1" style="width: 10rem; font-size: 16px; line-height: 20px; padding: 0; border: 0; box-sizing: content-box"></textarea>`,
})
class HostComponent {}

describe('AutoGrowDirective', () => {
  it('grows with wrapped text and shrinks back, never scrolling', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    document.body.append(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea') as HTMLTextAreaElement;
    const type = (value: string) => {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input'));
      return textarea.getBoundingClientRect().height;
    };

    const oneLine = type('Lait');
    const severalLines = type('Une très longue description qui ne tient pas sur une seule ligne du champ');

    expect(oneLine).toBe(20);
    expect(severalLines).toBeGreaterThanOrEqual(60);
    expect(textarea.scrollHeight).toBeLessThanOrEqual(Math.ceil(severalLines));
    expect(type('Lait')).toBe(oneLine);
    (fixture.nativeElement as HTMLElement).remove();
  });
});
