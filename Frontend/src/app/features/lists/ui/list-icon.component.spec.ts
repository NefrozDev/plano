import { TestBed } from '@angular/core/testing';
import type { ListIcon } from '@plano/common';
import { ListIconComponent } from './list-icon.component';
import { LIST_ICON_SHAPES } from './list-icons';

describe('ListIconComponent', () => {
  const draw = (icon: string) => {
    const fixture = TestBed.createComponent(ListIconComponent);
    fixture.componentRef.setInput('icon', icon as ListIcon);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      svg: element.querySelector('svg'),
      paths: Array.from(element.querySelectorAll('path'), (path) => path.getAttribute('d')),
    };
  };

  it('draws the icon’s paths, hidden from screen readers', () => {
    const { svg, paths } = draw('plane');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(paths).toEqual([...LIST_ICON_SHAPES.plane.paths]);
  });

  it('falls back to the cart for an icon it does not know', () => {
    expect(draw('rocket').paths).toEqual([...LIST_ICON_SHAPES.cart.paths]);
  });
});
